<script lang="ts">
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import LessonReader from '$lib/components/LessonReader.svelte';
	import QuizRunner, { type QuizReviewRecord } from '$lib/components/QuizRunner.svelte';
	import CompletionScreen from '$lib/components/CompletionScreen.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import type { ModuleDoc, CourseDoc } from '$lib/firebase/converters';

	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.moduleId);

	let course = $state<CourseDoc | null>(null);
	let moduleData = $state<ModuleDoc | null>(null);
	let allModules = $state<ModuleDoc[]>([]);
	let loading = $state(true);
	let loadError = $state('');

	// Time tracking
	let pageStartTime = $state(Date.now());
	let totalTimeSpentSeconds = $state(0);

	// Lesson state
	let currentPageIndex = $state(0);

	// Quiz state
	let quizReviewRecords = $state<QuizReviewRecord[]>([]);

	// Completion state
	let isCompleted = $state(false);
	let completionStreak = $state<number | undefined>(undefined);

	// Granular AI regeneration
	let isRegeneratingItem = $state(false);

	// Flag modal state
	let showFlagModal = $state(false);
	let flagReason = $state('');
	let isSubmittingFlag = $state(false);

	// Video recommendations
	interface ModuleVideo {
		videoId: string;
		title: string;
		channelTitle: string;
		thumbnailUrl: string;
	}
	let moduleVideos = $state<ModuleVideo[]>([]);
	let loadingVideos = $state(false);
	let activeVideoId = $state<string | null>(null);

	// Derived module sequence navigation
	let sortedModules = $derived(
		[...allModules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	);
	let currentModuleIndex = $derived(
		sortedModules.findIndex((m) => m.id === moduleId)
	);
	let nextModule = $derived(
		currentModuleIndex >= 0 && currentModuleIndex < sortedModules.length - 1
			? sortedModules[currentModuleIndex + 1]
			: null
	);

	// Single snapshot listener subscription
	$effect(() => {
		if (!courseId || !moduleId) return;

		loading = true;
		loadError = '';

		// 1. Listen to Course Document
		const courseRef = doc(db, 'courses', courseId);
		const unsubCourse = onSnapshot(
			courseRef,
			(snap) => {
				if (snap.exists()) {
					course = { id: snap.id, ...snap.data() } as CourseDoc;
				} else {
					loadError = 'Course not found.';
				}
			},
			(err) => {
				console.error('Course listener error:', err);
				loadError = 'Failed to load course details.';
			}
		);

		// 2. Listen to Active Module Document
		const modRef = doc(db, 'courses', courseId, 'modules', moduleId);
		const unsubModule = onSnapshot(
			modRef,
			(snap) => {
				if (snap.exists()) {
					moduleData = { id: snap.id, ...snap.data() } as ModuleDoc;
					studySessionStore.setModule(moduleId, moduleData.title);
					isCompleted = !!moduleData.completed;
				} else {
					loadError = 'Lesson module not found.';
				}
				loading = false;
			},
			(err) => {
				console.error('Module listener error:', err);
				loadError = 'Failed to load lesson content.';
				loading = false;
			}
		);

		// 3. Listen to all modules for progression ordering
		const modulesColRef = collection(db, 'courses', courseId, 'modules');
		const q = query(modulesColRef, orderBy('order', 'asc'));
		const unsubAllModules = onSnapshot(
			q,
			(snap) => {
				allModules = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ModuleDoc);
			},
			(err) => {
				console.warn('All modules listener error:', err);
			}
		);

		// Fetch relevant YouTube video recommendations
		fetchVideos();

		return () => {
			unsubCourse();
			unsubModule();
			unsubAllModules();
		};
	});

	const fetchVideos = async (refresh = false) => {
		if (!courseId || !moduleId) return;
		loadingVideos = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const url = `/api/courses/${courseId}/modules/${moduleId}/videos${refresh ? '?refresh=true' : ''}`;
			const res = await fetch(url, {
				headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
			});
			if (res.ok) {
				const data = await res.json();
				moduleVideos = data.videos || [];
			}
		} catch (err) {
			console.warn('Failed to fetch video recommendations:', err);
		} finally {
			loadingVideos = false;
		}
	};

	// Complete module and save progress
	const handleFinishModule = async (finalScore?: number, reviewItems?: QuizReviewRecord[]) => {
		try {
			const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
			totalTimeSpentSeconds += elapsedSeconds;

			if (reviewItems) {
				quizReviewRecords = reviewItems;
			}

			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/modules/${moduleId}/complete`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId,
					timeSpentSeconds: totalTimeSpentSeconds,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					...(moduleData?.type === 'quiz'
						? { quizScore: finalScore ?? 0, quizTotal: (moduleData.questions || []).length }
						: {})
				})
			});

			const data = await res.json();
			if (res.ok) {
				completionStreak = data.streak?.current;
				isCompleted = true;
			} else {
				throw new Error(data.error?.message || 'Failed to complete module');
			}
		} catch (err) {
			console.error('Error completing module:', err);
			toastStore.error('Could not save progress.');
			isCompleted = true;
		}
	};

	// Granular Single Item Regeneration
	const handleRegenerateItem = async () => {
		if (isRegeneratingItem || !courseId || !moduleId || !moduleData) return;
		isRegeneratingItem = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const itemType = moduleData.type === 'quiz' ? 'question' : 'page';
			const itemIndex = moduleData.type === 'quiz' ? 0 : currentPageIndex;

			const res = await fetch(`/api/modules/${moduleId}/regenerate-item`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId,
					itemType,
					itemIndex
				})
			});

			const data = await res.json();
			if (res.ok) {
				toastStore.success(`Single ${itemType} regenerated!`);
			} else {
				throw new Error(data.error?.message || 'Regeneration failed');
			}
		} catch (err) {
			console.error('Regenerate item error:', err);
			toastStore.error('Could not regenerate item.');
		} finally {
			isRegeneratingItem = false;
		}
	};

	// Content Flagging
	const handleFlagSubmit = async () => {
		if (!flagReason.trim() || isSubmittingFlag) return;
		isSubmittingFlag = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/flag', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId,
					moduleId,
					contentType: moduleData?.type || 'lesson',
					reason: flagReason
				})
			});

			if (res.ok) {
				toastStore.success('Content flagged for review. Thank you!');
				showFlagModal = false;
				flagReason = '';
			} else {
				toastStore.error('Failed to submit content flag.');
			}
		} catch (err) {
			console.error('Flag content error:', err);
			toastStore.error('Error submitting content flag.');
		} finally {
			isSubmittingFlag = false;
		}
	};
</script>

<svelte:head>
	<title>{moduleData?.title || 'Study Lesson'} &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
	<!-- Top Navigation Bar -->
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
		<a
			href={`/app/courses/${courseId}`}
			class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
		>
			&larr; Return to {course?.title || 'Course Overview'}
		</a>

		<div class="flex items-center gap-2">
			<!-- Flag Content Action -->
			<button
				type="button"
				onclick={() => (showFlagModal = true)}
				class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-danger hover:text-danger active:scale-95"
				title="Report inaccuracies or formatting issues"
			>
				🚩 Report Issue
			</button>
		</div>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-8 shadow-sm">
			<Skeleton height="32px" width="60%" />
			<Skeleton height="16px" width="40%" />
			<div class="space-y-3 pt-4">
				<Skeleton height="18px" width="100%" />
				<Skeleton height="18px" width="95%" />
				<Skeleton height="18px" width="90%" />
			</div>
		</div>
	{:else if loadError}
		<div
			class="flex flex-col items-center justify-center rounded-3xl border border-danger/30 bg-danger-soft p-12 text-center"
		>
			<span class="text-3xl">⚠️</span>
			<h3 class="mt-2 font-display text-base font-bold text-danger">Unable to load module</h3>
			<p class="mt-1 text-xs text-text-muted">{loadError}</p>
			<a
				href={`/app/courses/${courseId}`}
				class="mt-4 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white"
			>
				Back to Course
			</a>
		</div>
	{:else if isCompleted}
		<!-- Completion Celebration Screen -->
		<CompletionScreen
			title="{moduleData?.title || 'Module'} Completed!"
			subtitle="Great job! You have completed all content for this section."
			{courseId}
			{moduleId}
			streakCount={completionStreak}
			quizReviewItems={quizReviewRecords}
			nextModuleId={nextModule?.id}
			nextModuleTitle={nextModule?.title}
			onContinue={() => goto(`/app/courses/${courseId}`)}
			onNextModule={(nextId) => goto(`/app/courses/${courseId}/${nextId}`)}
		/>
	{:else if moduleData?.type === 'lesson'}
		<!-- Lesson Reading Studio with Study Lens & Zen Mode -->
		<LessonReader
			courseId={courseId || ''}
			moduleId={moduleId || ''}
			moduleTitle={moduleData.title}
			pages={moduleData.pages || []}
			canonicalConcepts={moduleData.concepts || []}
			{currentPageIndex}
			onPageChange={(newIdx) => (currentPageIndex = newIdx)}
			onComplete={handleFinishModule}
			onRegeneratePage={handleRegenerateItem}
			onFlagContent={() => (showFlagModal = true)}
			isRegenerating={isRegeneratingItem}
		/>
	{:else if moduleData?.type === 'quiz'}
		<!-- Adaptive Quiz Runner -->
		<QuizRunner
			courseId={courseId || ''}
			moduleId={moduleId || ''}
			moduleTitle={moduleData.title}
			questions={moduleData.questions || []}
			currentQuestionIndex={0}
			onComplete={handleFinishModule}
			onRegenerateQuestion={handleRegenerateItem}
			onFlagContent={() => (showFlagModal = true)}
			isRegenerating={isRegeneratingItem}
		/>
	{/if}

	<!-- Educational Video Recommendations -->
	{#if moduleVideos.length > 0 && !isCompleted}
		<div class="mt-4 flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="text-lg">🎬</span>
					<h3 class="font-display text-xs font-bold text-text">
						Recommended Video Lectures ({moduleVideos.length})
					</h3>
				</div>
				<button
					type="button"
					onclick={() => fetchVideos(true)}
					disabled={loadingVideos}
					class="cursor-pointer text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
				>
					{loadingVideos ? 'Refreshing...' : '🔄 Refresh Videos'}
				</button>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each moduleVideos as video (video.videoId)}
					<button
						type="button"
						onclick={() => (activeVideoId = video.videoId)}
						class="flex cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-surface-muted/50 p-3 text-left transition-colors hover:border-primary/50"
					>
						<img
							src={video.thumbnailUrl}
							alt={video.title}
							class="h-28 w-full rounded-xl object-cover"
							loading="lazy"
						/>
						<span class="line-clamp-2 text-xs font-bold text-text">{video.title}</span>
						<span class="text-[10px] font-semibold text-text-muted">{video.channelTitle}</span>
					</button>
				{/each}
			</div>

			<!-- Embedded YouTube Player Modal -->
			{#if activeVideoId}
				<div class="mt-2 rounded-2xl border border-border/80 bg-slate-950 p-3">
					<div class="mb-2 flex items-center justify-between">
						<span class="text-xs font-bold text-slate-300">Video Player</span>
						<button
							type="button"
							onclick={() => (activeVideoId = null)}
							class="cursor-pointer text-xs text-slate-400 hover:text-white"
						>
							✕ Close Video
						</button>
					</div>
					<div class="relative aspect-video w-full overflow-hidden rounded-xl">
						<iframe
							src="https://www.youtube.com/embed/{activeVideoId}?autoplay=1"
							title="YouTube video player"
							class="h-full w-full"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowfullscreen
						></iframe>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Report Issue / Flag Content Modal -->
	{#if showFlagModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
		>
			<div
				class="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-2xl"
			>
				<div class="flex items-center justify-between border-b border-border pb-2">
					<h3 class="font-display text-sm font-bold text-text">🚩 Report Content Issue</h3>
					<button
						type="button"
						onclick={() => (showFlagModal = false)}
						class="cursor-pointer text-xs text-text-muted hover:text-text"
					>
						✕
					</button>
				</div>

				<p class="text-xs leading-relaxed text-text-muted">
					Help us improve learning quality. Let us know if you spotted incorrect information, formatting issues, or broken elements in this module.
				</p>

				<textarea
					bind:value={flagReason}
					rows="3"
					placeholder="Describe the issue in detail..."
					class="w-full rounded-xl border border-border bg-surface-muted p-3 text-xs text-text focus:border-primary focus:outline-none"
				></textarea>

				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (showFlagModal = false)}
						class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleFlagSubmit}
						disabled={!flagReason.trim() || isSubmittingFlag}
						class="cursor-pointer rounded-xl bg-danger px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-danger/90 disabled:opacity-50"
					>
						{isSubmittingFlag ? 'Submitting...' : 'Submit Report'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
