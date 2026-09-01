<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, getDoc, updateDoc } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	interface Course {
		title: string;
	}

	interface LessonPage {
		heading: string;
		subheading?: string;
		body: string;
	}

	interface LessonModule {
		title: string;
		type: string;
		status: string;
		pages: LessonPage[];
	}

	interface VideoResult {
		videoId: string;
		title: string;
		channelTitle: string;
		thumbnailUrl: string;
	}

	import { themeStore } from '$lib/stores/theme.svelte';

	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.mid);

	// States
	let course = $state<Course | null>(null);
	let moduleData = $state<LessonModule | null>(null);
	let currentPage = $state(0);
	let loading = $state(true);
	let loadError = $state('');

	// Supplementary Video states
	let videos = $state<VideoResult[]>([]);
	let videosLoading = $state(false);
	let videosRefreshing = $state(false);
	let expandedVideoId = $state<string | null>(null);

	let progressLoaded = false;

	// Derive pages & pagination info
	let pages = $derived(moduleData?.pages || []);
	let totalPages = $derived(pages.length);
	let activePage = $derived(pages[currentPage] || null);
	let renderedBody = $derived.by(() => {
		if (activePage?.body) {
			return DOMPurify.sanitize(marked.parse(activePage.body) as string);
		}
		return '';
	});

	// Initialize data
	$effect(() => {
		if (authStore.user && courseId && moduleId) {
			loadData();
		}
	});

	const loadData = async () => {
		const cId = courseId as string;
		const mId = moduleId as string;
		const uid = authStore.user?.uid;
		if (!uid) return;

		loading = true;
		loadError = '';

		try {
			// 1. Fetch Course details
			const courseDoc = await getDoc(doc(db, 'courses', cId));
			if (courseDoc.exists()) {
				course = courseDoc.data() as Course;
			} else {
				loadError = 'The requested course could not be found.';
				loading = false;
				return;
			}

			// 2. Fetch Module details
			const moduleDoc = await getDoc(doc(db, `courses/${cId}/modules`, mId));
			if (moduleDoc.exists()) {
				moduleData = moduleDoc.data() as LessonModule;
				if (moduleData.type !== 'lesson' || moduleData.status !== 'ready') {
					// If not a ready lesson, redirect back to course view
					goto(resolve(`/courses/${cId}`));
					return;
				}
			} else {
				loadError = 'The requested lesson could not be found.';
				loading = false;
				return;
			}

			// 3. Get progress once for resuming page state
			const progressRef = doc(db, 'users', uid, 'progress', cId);
			const progressSnap = await getDoc(progressRef);
			if (progressSnap.exists() && !progressLoaded) {
				const progressData = progressSnap.data();
				const lastSavedPage = progressData?.lastPage?.[mId];
				const totalPageCount = moduleDoc.data()?.pages?.length || 0;
				if (typeof lastSavedPage === 'number' && lastSavedPage < totalPageCount) {
					currentPage = lastSavedPage;
				}
			}
			progressLoaded = true;
			loading = false;

			// Fetch supplementary videos in parallel (non-blocking)
			loadVideos();
		} catch (e) {
			console.error('Error loading lesson reader data:', e);
			loadError = 'Failed to load lesson content. Please check your network connection.';
			loading = false;
		}
	};

	const loadVideos = async (refresh = false) => {
		if (!auth.currentUser || !courseId || !moduleId) return;
		if (refresh) videosRefreshing = true;
		else videosLoading = true;

		try {
			const idToken = await auth.currentUser.getIdToken();
			const endpoint = `/api/courses/${courseId}/modules/${moduleId}/videos${refresh ? '?refresh=true' : ''}`;
			const res = await fetch(endpoint, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			if (!res.ok) throw new Error('Failed to fetch videos');
			const data = await res.json();
			videos = data.videos || [];
		} catch (e) {
			console.warn('[LessonReader] Supplementary videos could not be loaded:', e);
		} finally {
			videosLoading = false;
			videosRefreshing = false;
		}
	};

	// Automatically save reading progress when page changes
	$effect(() => {
		if (authStore.user && progressLoaded && pages.length > 0) {
			saveProgress(currentPage);
		}
	});

	const saveProgress = async (pageIndex: number) => {
		const cId = courseId as string;
		const mId = moduleId as string;
		const uid = authStore.user?.uid;
		if (!uid) return;

		try {
			const progressRef = doc(db, 'users', uid, 'progress', cId);
			await updateDoc(progressRef, {
				[`lastPage.${mId}`]: pageIndex
			});
		} catch (e) {
			console.error('Failed to save page progress:', e);
		}
	};

	// Keyboard navigation
	const handleKeyDown = (e: KeyboardEvent) => {
		if (loading || pages.length === 0) return;
		if (e.key === 'ArrowLeft') {
			prevPage();
		} else if (e.key === 'ArrowRight') {
			nextPage();
		}
	};

	const prevPage = () => {
		if (currentPage > 0) {
			currentPage -= 1;
		}
	};

	const nextPage = async () => {
		if (currentPage < totalPages - 1) {
			currentPage += 1;
		} else {
			await completeLesson();
		}
	};

	// Complete module & claim streak
	const completeLesson = async () => {
		if (loading) return;
		loading = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/modules/${moduleId}/complete`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					'X-Client-Theme': themeStore.current,
					'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
				},
				body: JSON.stringify({
					courseId,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
				})
			});

			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error?.message || 'Failed to complete module');
			}

			// Redirect to celebration screen
			const currentStreak = result.streak.current;
			const extended = result.streak.extended;
			goto(
				resolve(
					`/courses/${courseId}/complete?type=lesson&streak=${currentStreak}&extended=${extended}`
				)
			);
		} catch (e) {
			console.error(e);
			alert('Failed to complete the lesson. Please check your network connection.');
			loading = false;
		}
	};
</script>

<svelte:window onkeydown={handleKeyDown} />

<svelte:head>
	<title>{moduleData ? moduleData.title : 'Lesson Reader'} &mdash; AI Study Buddy</title>
</svelte:head>

<AppShell requireAuth={true}>
	<div class="max-w-3xl gap-6 px-6 py-8 mx-auto flex w-full grow flex-col">
		<!-- Header Navigation Back Link -->
		<a
			href={resolve(`/courses/${courseId}`)}
			class="gap-1.5 p-1.5 text-xs font-bold tracking-wider inline-flex items-center rounded-md text-text-muted uppercase transition-all duration-180 select-none hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-3.5 w-3.5"
				><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg
			>
			Back to course
		</a>

		{#if loadError}
			<div class="my-6 p-10 rounded-lg border border-border bg-surface text-center shadow-md">
				<div
					class="mb-4 h-12 w-12 inline-flex items-center justify-center rounded-md bg-danger-soft text-danger"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-6 w-6"
						><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line
							x1="12"
							y1="16"
							x2="12.01"
							y2="16"
						/></svg
					>
				</div>
				<h3 class="mb-2 font-display text-xl font-bold text-text">Failed to load lesson</h3>
				<p class="mb-6 text-sm text-text-muted">
					{loadError}
				</p>
				<div class="gap-3 flex justify-center">
					<a
						href={resolve(`/courses/${courseId}`)}
						class="px-6 py-3 text-xs font-bold rounded-r-md border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
					>
						Back to course
					</a>
					<button
						type="button"
						class="px-6 py-3 text-xs font-bold text-white rounded-r-md bg-primary shadow-sm hover:bg-primary-hover active:scale-[0.98]"
						onclick={() => {
							loading = true;
							loadError = '';
							loadData();
						}}
					>
						Retry
					</button>
				</div>
			</div>
		{:else if loading || !moduleData}
			<!-- Shimmer loading state -->
			<div
				class="animate-pulse gap-5 p-6 sm:p-10 flex grow flex-col rounded-lg border border-border bg-surface shadow-md"
			>
				<div class="mb-2 h-4 w-24 rounded bg-surface-muted"></div>
				<div class="mb-3 h-8 rounded w-2/3 bg-surface-muted"></div>
				<div class="mb-2 h-4 rounded w-full bg-surface-muted"></div>
				<div class="mb-2 h-4 rounded w-full bg-surface-muted"></div>
				<div class="h-4 rounded w-5/6 bg-surface-muted"></div>
			</div>
		{:else}
			<!-- Breadcrumb Header Row (as specified in PDF Page 04) -->
			<div
				class="gap-4 p-4 flex items-center rounded-lg border border-border bg-surface shadow-sm select-none"
			>
				<div
					class="h-10 w-10 text-sm font-bold flex items-center justify-center rounded-lg bg-primary-soft text-primary shadow-sm"
				>
					L
				</div>
				<div>
					<span class="mb-0.5 font-bold tracking-widest block text-[9px] text-text-muted uppercase">
						{course ? course.title : 'Course'}
					</span>
					<h2 class="font-display text-base leading-tight font-bold text-text">
						{moduleData.title}
					</h2>
				</div>
			</div>

			<!-- Thin page-progress line under header -->
			<div class="h-1 w-full overflow-hidden rounded-full border border-border/10 bg-surface-muted">
				<div
					class="h-full bg-primary transition-all duration-300"
					style="width: {((currentPage + 1) / totalPages) * 100}%"
				></div>
			</div>

			<!-- Lesson Page Content Card -->
			<div
				class="min-h-87.5 p-6 sm:p-10 flex grow flex-col justify-between rounded-lg border border-border bg-surface shadow-md"
			>
				<!-- Page Top Caption -->
				<div
					class="mb-6 font-bold tracking-widest text-[10px] text-text-muted uppercase select-none"
				>
					Page {currentPage + 1} of {totalPages}
				</div>

				<!-- Page Text Content -->
				<div class="gap-3 flex grow flex-col">
					<h3 class="font-display text-2xl leading-tight font-bold tracking-tight text-text">
						{activePage.heading}
					</h3>
					{#if activePage.subheading}
						<h4 class="mb-2 text-xs font-bold tracking-wider text-primary uppercase select-none">
							{activePage.subheading}
						</h4>
					{/if}

					<!-- Markdown rendered body -->
					<div
						class="prose mt-3 space-y-4 font-sans text-sm leading-relaxed max-w-none text-text-muted"
					>
						<!-- Render markdown body securely -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderedBody}
					</div>
				</div>

				<!-- Bottom Controls Row -->
				<div class="mt-8 pt-6 flex items-center justify-between border-t border-border select-none">
					<!-- Previous Button -->
					<button
						type="button"
						class="px-4.5 py-2.5 text-xs font-bold cursor-pointer rounded-r-md border border-border bg-surface text-text shadow-sm transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
						onclick={prevPage}
						disabled={currentPage === 0 || loading}
					>
						Previous
					</button>

					<!-- Navigation Page Dots (44x44px touch targets) -->
					<div class="gap-1 flex items-center">
						{#each Array.from({ length: totalPages }, (_, i) => i) as idx (idx)}
							<button
								type="button"
								class="h-11 w-11 flex cursor-pointer items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
								onclick={() => {
									if (!loading) currentPage = idx;
								}}
								aria-label="Go to page {idx + 1}"
							>
								<span
									class="h-2 w-2 rounded-full transition-all duration-180 {currentPage === idx
										? 'scale-125 bg-primary'
										: 'bg-border hover:bg-text-muted/50'}"
								></span>
							</button>
						{/each}
					</div>

					<!-- Next / Complete Button -->
					<button
						type="button"
						class="px-5 py-2.5 text-xs font-bold text-white cursor-pointer rounded-r-md bg-primary shadow-sm transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
						onclick={nextPage}
						disabled={loading}
					>
						{#if currentPage === totalPages - 1}
							Complete lesson
						{:else}
							Next
						{/if}
					</button>
				</div>
			</div>

			<!-- Supplementary Videos Section -->
			{#if videosLoading}
				<div class="mt-4 gap-3 flex flex-col">
					<div class="h-4 w-44 animate-pulse rounded bg-surface-muted"></div>
					<div class="gap-4 sm:grid-cols-3 grid grid-cols-1">
						{#each [0, 1, 2] as idx (idx)}
							<div
								class="h-44 animate-pulse rounded-lg border border-border bg-surface shadow-sm"
							></div>
						{/each}
					</div>
				</div>
			{:else if videos.length > 0}
				<section class="mt-4 gap-3 flex flex-col" aria-labelledby="supplementary-videos-heading">
					<div class="px-1 flex items-center justify-between select-none">
						<h3
							id="supplementary-videos-heading"
							class="gap-2 font-display text-xs font-bold tracking-wider flex items-center text-text-muted uppercase"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-4 w-4 text-primary"
								><polygon points="23 7 16 12 23 17 23 7" /><rect
									x="1"
									y="5"
									width="15"
									height="14"
									rx="2"
									ry="2"
								/></svg
							>
							Supplementary Learning Videos
						</h3>
						<button
							type="button"
							class="gap-1.5 px-2.5 py-1 font-bold inline-flex cursor-pointer items-center rounded-md border border-border bg-surface text-[11px] text-text-muted shadow-sm transition-all hover:bg-surface-muted hover:text-text disabled:opacity-50"
							onclick={() => loadVideos(true)}
							disabled={videosRefreshing}
							title="Fetch different videos for this lesson topic"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-3 w-3 {videosRefreshing ? 'animate-spin' : ''}"
								><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg
							>
							{videosRefreshing ? 'Refreshing...' : 'Reroll videos'}
						</button>
					</div>

					<div class="gap-4 sm:grid-cols-3 grid grid-cols-1">
						{#each videos as video (video.videoId)}
							<div
								class="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-all duration-180 hover:border-text-muted"
							>
								{#if expandedVideoId === video.videoId}
									<div class="aspect-video bg-black relative w-full">
										<iframe
											src="https://www.youtube-nocookie.com/embed/{video.videoId}?autoplay=1"
											title="{video.title} — YouTube video player"
											class="inset-0 absolute h-full w-full border-0"
											allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
											allowfullscreen
											loading="lazy"
										></iframe>
									</div>
								{:else}
									<button
										type="button"
										class="group aspect-video p-0 relative w-full cursor-pointer overflow-hidden border-0 bg-surface-muted text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
										onclick={() => (expandedVideoId = video.videoId)}
										aria-label="Play video: {video.title}"
									>
										<img
											src={video.thumbnailUrl}
											alt={video.title}
											class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
										/>
										<div
											class="inset-0 bg-black/25 group-hover:bg-black/40 absolute flex items-center justify-center transition-colors"
										>
											<div
												class="h-10 w-10 text-white flex items-center justify-center rounded-full bg-primary shadow-lg transition-transform group-hover:scale-110"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="currentColor"
													class="ml-0.5 h-4 w-4"><polygon points="5 3 19 12 5 21 5 3" /></svg
												>
											</div>
										</div>
									</button>
								{/if}

								<div class="p-3.5 flex grow flex-col justify-between">
									<div>
										<h4
											class="text-xs leading-snug font-bold line-clamp-2 text-text"
											title={video.title}
										>
											{video.title}
										</h4>
										<p class="mt-1 font-medium text-[11px] text-text-muted">
											{video.channelTitle}
										</p>
									</div>

									{#if expandedVideoId !== video.videoId}
										<button
											type="button"
											class="mt-3 py-1.5 text-xs font-bold hover:text-white w-full cursor-pointer rounded-r-md bg-primary-soft text-center text-primary transition-all hover:bg-primary active:scale-[0.97]"
											onclick={() => (expandedVideoId = video.videoId)}
										>
											Watch Video
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</div>
</AppShell>

<style>
	/* Styling inline code blocks matching PDF page 05 rules */
	:global(.prose code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background-color: var(--surface-muted);
		padding: 0.15rem 0.35rem;
		border-radius: 4px;
		color: var(--primary);
		border: 1px solid var(--border);
	}
	:global(.prose ul) {
		list-style-type: disc;
		padding-left: 1.25rem;
	}
	:global(.prose li) {
		margin-bottom: 0.4rem;
	}
</style>
