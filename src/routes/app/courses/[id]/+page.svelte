<script lang="ts">
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { CourseDoc, ModuleDoc } from '$lib/firebase/converters';
	import {
		generateCourseMarkdown,
		downloadFile,
		printCourse,
		downloadAnkiDeck
	} from '$lib/utils/export';

	const courseId = $derived(page.params.id);

	let course = $state<CourseDoc | null>(null);
	let modules = $state<ModuleDoc[]>([]);
	let userCompletedModuleIds = $state<string[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let actionLoading = $state(false);

	let shareUrl = $state('');
	let showShareModal = $state(false);

	// Push notification when generation finishes (Item #5)
	let previousCourseStatus = $state<string | null>(null);
	$effect(() => {
		if (course?.status) {
			if (previousCourseStatus === 'building' && course.status === 'ready') {
				toastStore.success('🎉 Course generation complete! All modules are ready.');

				if ('Notification' in window && Notification.permission === 'granted') {
					new Notification('Course Generation Complete!', {
						body: `"${course.title}" is fully built and ready to start!`,
						icon: '/favicon.png'
					});
				}
			}
			previousCourseStatus = course.status;
		}
	});

	const requestNotificationPermission = () => {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	};

	// Unified Real-time Course, Modules, and User Progress Listener
	$effect(() => {
		if (!courseId) return;

		// Request notification permission if course is building
		requestNotificationPermission();

		const courseRef = doc(db, 'courses', courseId);
		const unsubCourse = onSnapshot(
			courseRef,
			(snap) => {
				if (snap.exists()) {
					course = { id: snap.id, ...snap.data() } as CourseDoc;
				} else {
					loadError = 'Course not found.';
				}
				loading = false;
			},
			(err) => {
				console.error('Course fetch error:', err);
				loadError = 'Failed to load course details.';
				loading = false;
			}
		);

		const modulesRef = collection(db, 'courses', courseId, 'modules');
		const q = query(modulesRef, orderBy('order', 'asc'));
		const unsubModules = onSnapshot(q, (snap) => {
			const mods = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ModuleDoc[];
			mods.sort((a, b) => (a.order || 0) - (b.order || 0));
			modules = mods;
		});

		let unsubProgress: (() => void) | null = null;
		const uid = auth.currentUser?.uid;
		if (uid) {
			const progressRef = doc(db, 'users', uid, 'progress', courseId);
			unsubProgress = onSnapshot(progressRef, (snap) => {
				if (snap.exists()) {
					userCompletedModuleIds = snap.data()?.completedModuleIds || [];
				}
			});
		}

		return () => {
			unsubCourse();
			unsubModules();
			if (unsubProgress) unsubProgress();
		};
	});

	let completedCount = $derived(userCompletedModuleIds.length);
	let totalModules = $derived(modules.length);
	let progressPercentage = $derived(
		totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0
	);
	let isCourseCompleted = $derived(totalModules > 0 && completedCount >= totalModules);

	const handleAddModule = async () => {
		if (actionLoading || !courseId) return;
		actionLoading = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/modules/add`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Failed to add module');
			}

			// Trigger module generation
			fetch(`/api/modules/${data.moduleId}/generate`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ courseId })
			}).catch((e) => console.error('Module gen error:', e));

			toastStore.success('New module added! Generating content...');
		} catch (err) {
			console.error('Add module error:', err);
			toastStore.error('Failed to add module slot');
		} finally {
			actionLoading = false;
		}
	};

	const handleRetryModule = async (moduleId: string) => {
		if (!courseId) return;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/modules/${moduleId}/retry`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ courseId })
			});
			if (res.ok) {
				toastStore.info('Retrying module generation...');
			} else {
				toastStore.error('Retry failed');
			}
		} catch (err) {
			console.error('Retry module error:', err);
		}
	};

	const handleOpenShare = () => {
		shareUrl = `${window.location.origin}/shared/${courseId}`;
		showShareModal = true;
	};

	const handleExportMarkdown = () => {
		if (!course) return;
		const content = generateCourseMarkdown(course, modules);
		const filename = `${course.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-course.md`;
		downloadFile(filename, content);
		toastStore.success('Course exported as Markdown!');
	};

	const handleExportPDF = () => {
		if (!course) return;
		printCourse(course, modules);
	};

	const handleExportAnki = () => {
		if (!course) return;
		downloadAnkiDeck(course, modules);
		toastStore.success('Anki Deck exported (.txt format ready for Anki Import)!');
	};

	const handleConsistencyCheck = async () => {
		if (!courseId) return;
		actionLoading = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/consistency-check`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${idToken}` }
			});
			const data = await res.json();
			if (res.ok) {
				toastStore.success('Consistency audit complete!');
				if (data.notes) {
					alert(`Consistency Audit Notes:\n\n${data.notes}`);
				}
			} else {
				toastStore.error(data.error?.message || 'Consistency check failed');
			}
		} catch (err) {
			console.error('Consistency check error:', err);
			toastStore.error('Consistency check failed');
		} finally {
			actionLoading = false;
		}
	};
</script>

<svelte:head>
	<title>{course?.title || 'Course Overview'} &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-8 py-4">
	<!-- Back Link & Action Bar -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<a
			href="/app"
			class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
		>
			&larr; Back to Courses
		</a>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handleConsistencyCheck}
				disabled={actionLoading}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary disabled:opacity-50"
				title="Audit course consistency across modules"
			>
				<span>🔍 Audit</span>
			</button>

			<button
				type="button"
				onclick={handleExportAnki}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary"
				title="Export Quiz Flashcards for Anki"
			>
				<span>🗂️ Anki Deck</span>
			</button>

			<button
				type="button"
				onclick={handleExportMarkdown}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary"
				title="Export Course as Markdown file"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				<span>Export MD</span>
			</button>

			<button
				type="button"
				onclick={handleExportPDF}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary"
				title="Print or Save Course as PDF"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
					/>
				</svg>
				<span>Print / PDF</span>
			</button>

			<button
				type="button"
				onclick={handleOpenShare}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
					/>
				</svg>
				<span>Share Course</span>
			</button>
		</div>
	</div>

	{#if loading}
		<Skeleton variant="card" height="h-40" />
		<Skeleton variant="card" height="h-64" />
	{:else if loadError || !course}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{loadError || 'Course not found.'}
		</div>
	{:else}
		<!-- Course Overview Header -->
		<div
			class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
		>
			<!-- Badges strip -->
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="rounded-lg border border-primary/20 bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary uppercase"
				>
					{course.level || 'Intermediate'}
				</span>
				<span
					class="rounded-lg border border-border/40 bg-surface-muted px-2.5 py-1 text-[10px] font-bold text-text-muted"
				>
					⏱️ ~{course.estimatedMinutes || 45} mins
				</span>
				{#each course.tags || [] as tag (tag)}
					<span
						class="rounded-lg border border-border/40 bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-text-muted"
					>
						#{tag}
					</span>
				{/each}
			</div>

			<div>
				<h1 class="font-display text-2xl font-bold text-text sm:text-3xl">{course.title}</h1>
				<p class="mt-2 text-xs leading-relaxed text-text-muted sm:text-sm">{course.description}</p>
			</div>

			<!-- Status Banner if Building or Failed -->
			{#if course.status === 'building'}
				<div
					class="flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-xs text-indigo-300"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 font-bold">
							<span class="h-2.5 w-2.5 animate-ping rounded-full bg-indigo-400"></span>
							<span>AI Study Buddy is building your course content in the background...</span>
						</div>
						<span class="text-[10px] font-semibold text-indigo-200/80">
							🔔 Feel free to leave this tab &mdash; we'll alert you when ready!
						</span>
					</div>

					<!-- Immediate Module 1 Start Banner (Item #6) -->
					{#if modules.length > 0 && modules[0].status === 'ready'}
						<div
							class="mt-1 flex items-center justify-between rounded-lg border border-indigo-400/30 bg-indigo-900/60 p-2.5 text-white"
						>
							<span class="font-bold"
								>🚀 Module 1 is ready! Start reading now while remaining modules finish building.</span
							>
							<a
								href={`/app/courses/${courseId}/${modules[0].id}`}
								class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover active:scale-95"
							>
								Start Module 1 &rarr;
							</a>
						</div>
					{/if}
				</div>
			{:else if course.status === 'partial' || course.status === 'failed'}
				<div
					class="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-300"
				>
					<span>Some modules failed generation. Click retry below to regenerate them.</span>
				</div>
			{/if}

			<!-- Certificate Card OR Progress Bar -->
			{#if isCourseCompleted}
				<div
					class="mt-2 flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-linear-to-r from-emerald-950/40 to-teal-950/40 p-6 text-center shadow-lg"
				>
					<div class="mb-3 text-3xl">🎓</div>
					<h3 class="font-display text-lg font-bold text-emerald-300">
						Course Achievement Unlocked!
					</h3>
					<p class="mt-1 text-xs text-emerald-200/80">You have completed 100% of {course.title}.</p>
					<button
						type="button"
						onclick={handleOpenShare}
						class="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95"
					>
						Share Your Achievement
					</button>
				</div>
			{:else}
				<div class="mt-2">
					<ProgressBar
						progress={progressPercentage}
						showLabel={true}
						label="Course Completion"
						accent={course.accent || 'primary'}
					/>
				</div>
			{/if}
		</div>

		<!-- Modules List -->
		<div class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<h2 class="font-display text-lg font-bold text-text">Modules ({modules.length})</h2>
				<button
					type="button"
					onclick={handleAddModule}
					disabled={actionLoading}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-primary shadow-xs transition-colors hover:border-primary disabled:opacity-50"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					+ Add a module
				</button>
			</div>

			<div class="flex flex-col gap-3">
				{#each modules as mod, idx (mod.id)}
					{@const isCompleted = userCompletedModuleIds.includes(mod.id || '')}
					{@const isReady = mod.status === 'ready'}
					{@const isGenerating = mod.status === 'generating' || mod.status === 'pending'}
					{@const isFailed = mod.status === 'failed'}

					<div
						class="flex items-center justify-between rounded-2xl border p-4 shadow-xs transition-all duration-200 {isReady
							? 'border-border bg-surface hover:border-primary/40'
							: isGenerating
								? 'animate-pulse border-border/60 bg-surface-muted/40 opacity-70'
								: 'border-danger/30 bg-danger-soft/20'}"
					>
						<div class="flex items-center gap-3.5">
							<!-- Status Check / Icon -->
							{#if isCompleted}
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-sm font-bold text-emerald-400"
								>
									✓
								</div>
							{:else if isGenerating}
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
								>
									<span
										class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
									></span>
								</div>
							{:else if isFailed}
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft font-bold text-danger"
								>
									!
								</div>
							{:else}
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-xs font-bold text-text-muted"
								>
									{idx + 1}
								</div>
							{/if}

							<!-- Module Info -->
							<div>
								<div class="flex items-center gap-2">
									<h4 class="font-display text-sm font-bold text-text">{mod.title}</h4>
									<span
										class="rounded-md border border-border/40 px-2 py-0.5 text-[9px] font-bold text-text-muted uppercase"
									>
										{mod.type}
									</span>

									<!-- Per-module Granular Progress Badge (Item #5) -->
									{#if isGenerating}
										<span
											class="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-300"
										>
											{mod.status === 'pending' ? 'Queued' : 'Building Content'}
										</span>
									{/if}
								</div>
								<p class="mt-0.5 line-clamp-1 text-xs text-text-muted">{mod.summary}</p>
							</div>
						</div>

						<!-- Action CTA -->
						<div class="shrink-0">
							{#if isReady}
								<a
									href={`/app/courses/${courseId}/${mod.id}`}
									class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary-hover active:scale-95"
								>
									<span>{isCompleted ? 'Review' : 'Start'}</span>
									<span>&rarr;</span>
								</a>
							{:else if isGenerating}
								<span class="text-[11px] font-semibold text-text-muted">Generating...</span>
							{:else if isFailed}
								<button
									type="button"
									onclick={() => handleRetryModule(mod.id || '')}
									class="cursor-pointer rounded-xl bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/20"
								>
									Retry
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<ShareModal
	show={showShareModal}
	{shareUrl}
	courseTitle={course?.title || 'Course'}
	onClose={() => (showShareModal = false)}
/>
