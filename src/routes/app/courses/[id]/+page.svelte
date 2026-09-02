<script lang="ts">
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import CertificateModal from '$lib/components/CertificateModal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
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
	let retryCount = $state(0);

	let shareUrl = $state('');
	let showShareModal = $state(false);
	let showCertificateModal = $state(false);

	const retryFetch = () => {
		loadError = '';
		loading = true;
		retryCount++;
	};

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

	// Handle automatic reconnect on network restore
	$effect(() => {
		if (typeof window === 'undefined') return;
		const handleOnline = () => {
			if (loadError) retryFetch();
		};
		window.addEventListener('online', handleOnline);
		return () => window.removeEventListener('online', handleOnline);
	});

	const requestNotificationPermission = () => {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	};

	// Unified Real-time Course, Modules, and User Progress Listener
	$effect(() => {
		if (!courseId) return;
		void retryCount;

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
				loadError = 'Failed to load course details. Please check network connection.';
				loading = false;
			}
		);

		const modulesRef = collection(db, 'courses', courseId, 'modules');
		const q = query(modulesRef, orderBy('order', 'asc'));
		const unsubModules = onSnapshot(
			q,
			(snap) => {
				const mods = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ModuleDoc[];
				mods.sort((a, b) => (a.order || 0) - (b.order || 0));
				modules = mods;
			},
			(err) => {
				console.error('Modules fetch error:', err);
			}
		);

		let unsubProgress: (() => void) | null = null;
		const uid = authStore.user?.uid;
		if (uid) {
			const progressRef = doc(db, 'users', uid, 'progress', courseId);
			unsubProgress = onSnapshot(
				progressRef,
				(snap) => {
					if (snap.exists()) {
						userCompletedModuleIds = snap.data()?.completedModuleIds || [];
					}
				},
				(err) => {
					console.warn('Progress fetch error:', err);
				}
			);
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

	let readyCount = $derived(modules.filter((m) => m.status === 'ready').length);
	let generatingCount = $derived(
		modules.filter((m) => m.status === 'generating' || m.status === 'pending').length
	);
	let failedCount = $derived(modules.filter((m) => m.status === 'failed').length);
	let activeBuildingModule = $derived(
		modules.find((m) => m.status === 'generating') || modules.find((m) => m.status === 'pending')
	);
	let genProgressPct = $derived(
		totalModules > 0 ? Math.round((readyCount / totalModules) * 100) : 0
	);

	let previousReadyCount = $state<number | null>(null);
	$effect(() => {
		if (
			previousReadyCount !== null &&
			readyCount > previousReadyCount &&
			readyCount < totalModules
		) {
			const justCompleted = modules.find((m) => m.status === 'ready');
			if (justCompleted) {
				toastStore.success(
					`✨ Module ready to study! (${readyCount}/${totalModules} modules ready)`
				);
			}
		}
		previousReadyCount = readyCount;
	});

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
		} finally {
			actionLoading = false;
		}
	};

	let nextIncompleteModule = $derived.by(() => {
		return (
			modules.find((m) => m.status === 'ready' && !userCompletedModuleIds.includes(m.id || '')) ||
			modules[0]
		);
	});

	let showExportMenu = $state(false);
</script>

<svelte:head>
	<title>{course?.title || 'Course Workspace'} &mdash; Study AI</title>
</svelte:head>

<div class="max-w-4xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Top Bar -->
	<div class="gap-3 pb-3 flex items-center justify-between border-b border-border">
		<a
			href="/app"
			class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
		>
			&larr; Return to Dashboard
		</a>

		<div class="gap-2 flex items-center">
			<a
				href={`/app/review?courseId=${courseId}`}
				class="gap-1.5 border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 shadow-xs hover:border-amber-400 inline-flex cursor-pointer items-center rounded-xl border transition-colors"
				title="Drill course flashcards in Spaced Repetition (FSRS-4.5)"
			>
				<span>🧠 FSRS Drill</span>
			</a>

			<button
				type="button"
				onclick={handleOpenShare}
				class="gap-1.5 px-3 py-1.5 text-xs font-bold shadow-xs inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary"
			>
				<span>🔗 Share</span>
			</button>

			<!-- Export & Tools Dropdown -->
			<div class="relative">
				<button
					type="button"
					onclick={() => (showExportMenu = !showExportMenu)}
					class="gap-1 px-3 py-1.5 text-xs font-bold inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text-muted hover:border-primary hover:text-text"
					aria-label="Course actions and exports"
				>
					<span>⚙️ Export & Audit</span>
					<span class="text-[10px]">▼</span>
				</button>

				{#if showExportMenu}
					<div
						class="right-0 mt-2 w-48 gap-1 rounded-2xl p-2 shadow-xl absolute z-30 flex flex-col border border-border bg-surface"
					>
						<button
							type="button"
							onclick={() => {
								showExportMenu = false;
								handleConsistencyCheck();
							}}
							class="gap-2 px-3 py-2 text-xs font-medium flex w-full cursor-pointer items-center rounded-xl text-left text-text hover:bg-surface-muted"
						>
							<span>🔍 Consistency Audit</span>
						</button>
						<button
							type="button"
							onclick={() => {
								showExportMenu = false;
								handleExportAnki();
							}}
							class="gap-2 px-3 py-2 text-xs font-medium flex w-full cursor-pointer items-center rounded-xl text-left text-text hover:bg-surface-muted"
						>
							<span>🗂️ Anki Deck (.txt)</span>
						</button>
						<button
							type="button"
							onclick={() => {
								showExportMenu = false;
								handleExportMarkdown();
							}}
							class="gap-2 px-3 py-2 text-xs font-medium flex w-full cursor-pointer items-center rounded-xl text-left text-text hover:bg-surface-muted"
						>
							<span>📄 Markdown File</span>
						</button>
						<button
							type="button"
							onclick={() => {
								showExportMenu = false;
								handleExportPDF();
							}}
							class="gap-2 px-3 py-2 text-xs font-medium flex w-full cursor-pointer items-center rounded-xl text-left text-text hover:bg-surface-muted"
						>
							<span>🖨️ Print / Save PDF</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if loading}
		<Skeleton variant="card" height="h-40" />
		<Skeleton variant="card" height="h-64" />
	{:else if loadError || !course}
		<div
			class="gap-3 rounded-2xl p-6 text-xs font-bold flex flex-col items-center justify-center border border-danger/20 bg-danger-soft text-center text-danger"
		>
			<span>{loadError || 'Course not found.'}</span>
			{#if loadError}
				<button
					type="button"
					onclick={() => retryFetch()}
					class="px-4 py-2 font-semibold text-white rounded-xl bg-danger shadow-sm transition hover:bg-danger/90"
				>
					🔄 Try Again
				</button>
			{/if}
		</div>
	{:else}
		<!-- Course Overview Header -->
		<div
			class="gap-4 rounded-3xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
		>
			<!-- Badges strip -->
			<div class="gap-2 flex flex-wrap items-center">
				<span
					class="px-2.5 py-1 font-bold rounded-lg border border-primary/20 bg-primary-soft text-[10px] text-primary uppercase"
				>
					{course.level || 'Intermediate'}
				</span>
				<span
					class="px-2.5 py-1 font-bold rounded-lg border border-border/40 bg-surface-muted text-[10px] text-text-muted"
				>
					⏱️ ~{course.estimatedMinutes || 45} mins
				</span>
				{#each course.tags || [] as tag (tag)}
					<span
						class="px-2.5 py-1 font-semibold rounded-lg border border-border/40 bg-surface-muted text-[10px] text-text-muted"
					>
						#{tag}
					</span>
				{/each}
			</div>

			<div>
				<h1 class="font-display text-2xl font-bold sm:text-3xl text-text">{course.title}</h1>
				<p class="mt-2 text-xs leading-relaxed sm:text-sm text-text-muted">{course.description}</p>
			</div>

			<!-- Status Banner if Building or Failed -->
			{#if course.status === 'building' || generatingCount > 0}
				<div
					class="gap-3 rounded-2xl border-indigo-500/30 bg-indigo-500/10 p-5 text-xs text-indigo-200 shadow-inner flex flex-col border"
				>
					<div class="gap-2 flex flex-wrap items-center justify-between">
						<div class="gap-2.5 text-sm font-bold text-indigo-100 flex items-center">
							<span class="h-3 w-3 relative flex">
								<span
									class="animate-ping bg-indigo-400 absolute inline-flex h-full w-full rounded-full opacity-75"
								></span>
								<span class="h-3 w-3 bg-indigo-500 relative inline-flex rounded-full"></span>
							</span>
							<span>Generating AI Course Content ({readyCount}/{totalModules} ready)</span>
						</div>
						<span class="font-semibold text-indigo-300/80 text-[11px]">
							🔔 Feel free to leave this tab &mdash; we'll alert you when complete!
						</span>
					</div>

					<!-- Visual Generation Progress Bar -->
					<div
						class="h-2 border-indigo-500/20 bg-indigo-950/60 w-full overflow-hidden rounded-full border"
					>
						<div
							class="from-indigo-500 to-sky-400 h-full bg-linear-to-r transition-all duration-500"
							style="width: {genProgressPct}%"
						></div>
					</div>

					{#if activeBuildingModule}
						<div class="gap-2 font-medium text-indigo-300 flex items-center text-[11px]">
							<span
								class="h-3 w-3 animate-spin border-indigo-300 rounded-full border-2 border-t-transparent"
							></span>
							<span>Building content for <strong>{activeBuildingModule.title}</strong>...</span>
						</div>
					{/if}

					<!-- Immediate Module 1 Start Banner -->
					{#if modules.length > 0 && modules[0].status === 'ready'}
						<div
							class="mt-1 gap-3 border-emerald-500/30 bg-emerald-950/60 p-3 text-white flex flex-wrap items-center justify-between rounded-xl border shadow-sm"
						>
							<div class="gap-2 flex items-center">
								<span class="text-base">🚀</span>
								<span class="text-xs font-bold text-emerald-200">
									Module 1 is ready! Start learning now while remaining modules finish in the
									background.
								</span>
							</div>
							<a
								href={`/app/courses/${courseId}/${modules[0].id}`}
								class="bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-xs hover:bg-emerald-400 rounded-lg transition-all active:scale-95"
							>
								Start Module 1 &rarr;
							</a>
						</div>
					{/if}
				</div>
			{:else if course.status === 'partial' || course.status === 'failed' || failedCount > 0}
				<div
					class="border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-300 flex items-center justify-between rounded-xl border"
				>
					<span
						>Some modules failed generation. Click retry on failed modules below to regenerate them.</span
					>
				</div>
			{/if}

			<!-- Certificate Card OR Progress Bar & Continue CTA -->
			{#if isCourseCompleted}
				<div
					class="mt-2 rounded-2xl border-emerald-500/30 from-emerald-950/40 to-teal-950/40 p-6 flex flex-col items-center justify-center border bg-linear-to-r text-center shadow-lg"
				>
					<div class="mb-3 text-3xl">🎓</div>
					<h3 class="font-display text-lg font-bold text-emerald-300">
						Course Achievement Unlocked!
					</h3>
					<p class="mt-1 text-xs text-emerald-200/80">You have completed 100% of {course.title}.</p>
					<div class="mt-4 gap-3 flex flex-wrap items-center justify-center">
						<button
							type="button"
							onclick={() => (showCertificateModal = true)}
							class="bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 rounded-xl shadow-md transition-all active:scale-95"
						>
							📜 Download / Print Certificate
						</button>
						<button
							type="button"
							onclick={handleOpenShare}
							class="bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 rounded-xl shadow-md transition-all active:scale-95"
						>
							Share Your Achievement
						</button>
					</div>
				</div>
			{:else}
				<div class="mt-2 gap-3 flex flex-col">
					<ProgressBar
						progress={progressPercentage}
						showLabel={true}
						label="Course Completion"
						accent={course.accent || 'primary'}
					/>

					{#if nextIncompleteModule && nextIncompleteModule.status === 'ready'}
						<div
							class="gap-3 rounded-2xl p-3.5 flex flex-wrap items-center justify-between border border-primary/30 bg-primary-soft/30"
						>
							<div class="gap-3 flex items-center">
								<span
									class="h-8 w-8 text-xs font-bold text-white shadow-xs flex items-center justify-center rounded-xl bg-primary"
								>
									→
								</span>
								<div>
									<div class="gap-2 flex items-center">
										<span class="font-black tracking-wider text-[10px] text-primary uppercase">
											Up Next
										</span>
										{#if nextIncompleteModule.estimatedMinutes}
											<span class="text-[10px] text-text-muted">
												• ~{nextIncompleteModule.estimatedMinutes} mins
											</span>
										{/if}
									</div>
									<h4 class="font-display text-xs font-bold text-text">
										{nextIncompleteModule.title}
									</h4>
								</div>
							</div>

							<a
								href={`/app/courses/${courseId}/${nextIncompleteModule.id}`}
								class="gap-1.5 px-4 py-2 text-xs font-bold text-white shadow-xs inline-flex items-center rounded-xl bg-primary transition-all hover:bg-primary-hover active:scale-95"
							>
								<span>Continue Learning &rarr;</span>
							</a>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Modules List -->
		<div class="gap-4 flex flex-col">
			<div class="flex items-center justify-between">
				<h2 class="font-display text-lg font-bold text-text">Modules ({modules.length})</h2>
				<button
					type="button"
					onclick={handleAddModule}
					disabled={actionLoading}
					class="gap-1.5 px-3 py-1.5 text-xs font-bold shadow-xs inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-primary transition-colors hover:border-primary disabled:opacity-50"
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

			<div class="gap-3 flex flex-col">
				{#each modules as mod, idx (mod.id)}
					{@const isCompleted = userCompletedModuleIds.includes(mod.id || '')}
					{@const isReady = mod.status === 'ready'}
					{@const isGenerating = mod.status === 'generating' || mod.status === 'pending'}
					{@const isFailed = mod.status === 'failed'}
					{@const isNextUp = nextIncompleteModule?.id === mod.id && !isCompleted}

					<div
						class="gap-3 rounded-2xl p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between flex flex-col border transition-all duration-200 {isNextUp
							? 'border-primary/50 bg-primary-soft/10 ring-1 ring-primary/30'
							: isReady
								? 'border-border bg-surface hover:border-primary/40'
								: isGenerating
									? 'animate-pulse border-border/60 bg-surface-muted/40 opacity-70'
									: 'border-danger/30 bg-danger-soft/20'}"
					>
						<div class="gap-3.5 flex items-center">
							<!-- Status Check / Icon -->
							{#if isCompleted}
								<div
									class="h-9 w-9 bg-emerald-500/20 text-sm font-bold text-emerald-400 flex shrink-0 items-center justify-center rounded-xl"
								>
									✓
								</div>
							{:else if isNextUp}
								<div
									class="h-9 w-9 text-xs font-bold text-white shadow-xs flex shrink-0 items-center justify-center rounded-xl bg-primary"
								>
									→
								</div>
							{:else if isGenerating}
								<div
									class="h-9 w-9 flex shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
								>
									<span
										class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
									></span>
								</div>
							{:else if isFailed}
								<div
									class="h-9 w-9 font-bold flex shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger"
								>
									!
								</div>
							{:else}
								<div
									class="h-9 w-9 text-xs font-bold flex shrink-0 items-center justify-center rounded-xl bg-surface-muted text-text-muted"
								>
									{idx + 1}
								</div>
							{/if}

							<!-- Module Info -->
							<div>
								<div class="gap-2 flex flex-wrap items-center">
									<h4 class="font-display text-sm font-bold text-text">{mod.title}</h4>
									<span
										class="px-2 py-0.5 font-bold rounded-md border border-border/40 bg-surface-muted text-[9px] text-text-muted uppercase"
									>
										{mod.type}
									</span>

									{#if mod.estimatedMinutes}
										<span
											class="px-2 py-0.5 font-semibold rounded-md border border-border/40 bg-surface-muted text-[9px] text-text-muted"
										>
											⏱️ ~{mod.estimatedMinutes} min
										</span>
									{/if}

									<!-- Per-module Granular Progress Badge (Item #5) -->
									{#if isGenerating}
										<span
											class="bg-indigo-500/20 px-2 py-0.5 font-bold text-indigo-300 rounded-md text-[9px]"
										>
											{mod.status === 'pending' ? 'Queued' : 'Building Content'}
										</span>
									{/if}
								</div>
								<p class="mt-0.5 text-xs line-clamp-1 text-text-muted">{mod.summary}</p>
							</div>
						</div>

						<!-- Action CTA -->
						<div class="sm:self-auto shrink-0 self-end">
							{#if isReady}
								<div class="gap-2 flex items-center">
									{#if mod.type === 'quiz'}
										<a
											href={`/app/review?courseId=${courseId}&moduleId=${mod.id}`}
											class="gap-1 border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 shadow-xs hover:bg-amber-500/20 inline-flex cursor-pointer items-center justify-center rounded-xl border active:scale-95"
											title="Drill flashcards in Spaced Repetition (FSRS-4.5)"
										>
											<span>🧠 FSRS Drill</span>
										</a>
									{/if}
									<a
										href={`/app/courses/${courseId}/${mod.id}`}
										class="gap-1.5 px-4 py-2 text-xs font-bold shadow-xs inline-flex cursor-pointer items-center justify-center rounded-xl transition-all active:scale-95 {isNextUp
											? 'text-white bg-primary ring-2 ring-primary/20 hover:bg-primary-hover'
											: 'bg-surface-muted text-text hover:bg-surface-muted/80'}"
									>
										<span>{isCompleted ? 'Review' : 'Start'}</span>
										<span>&rarr;</span>
									</a>
								</div>
							{:else if isGenerating}
								<span class="font-semibold text-[11px] text-text-muted">Generating...</span>
							{:else if isFailed}
								<button
									type="button"
									onclick={() => handleRetryModule(mod.id || '')}
									class="px-3 py-1.5 text-xs font-bold cursor-pointer rounded-xl bg-danger-soft text-danger hover:bg-danger/20"
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

<CertificateModal
	isOpen={showCertificateModal}
	userName={auth.currentUser?.displayName || 'Learner'}
	courseTitle={course?.title || 'Course'}
	onClose={() => (showCertificateModal = false)}
/>
