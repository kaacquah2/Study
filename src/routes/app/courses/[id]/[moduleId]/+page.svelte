<script lang="ts">
	import { page } from '$app/state';
	import { db } from '$lib/firebase/client';
	import { apiFetch } from '$lib/api/client';
	import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import LessonReader from '$lib/components/LessonReader.svelte';
	import QuizRunner, {
		type QuizReviewRecord,
		type QuizGradedResult
	} from '$lib/components/QuizRunner.svelte';
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
	let quizStarted = $state(false);
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
	let retryCount = $state(0);

	const retryFetch = () => {
		loadError = '';
		loading = true;
		retryCount++;
		fetchVideos(true);
	};

	// Handle automatic reconnect on network restore
	$effect(() => {
		if (typeof window === 'undefined') return;
		const handleOnline = () => {
			if (loadError) retryFetch();
		};
		window.addEventListener('online', handleOnline);
		return () => window.removeEventListener('online', handleOnline);
	});

	// Derived module sequence navigation
	let sortedModules = $derived([...allModules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
	let currentModuleIndex = $derived(sortedModules.findIndex((m) => m.id === moduleId));
	let nextModule = $derived(
		currentModuleIndex >= 0 && currentModuleIndex < sortedModules.length - 1
			? sortedModules[currentModuleIndex + 1]
			: null
	);

	// 1. Course-level listener (course doc and allModules collection)
	// Subscribed once per course view, NOT re-created when navigating between modules
	$effect(() => {
		if (!courseId) return;
		void retryCount;

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
				loadError = 'Failed to load course details. Please check network connection.';
			}
		);

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

		return () => {
			unsubCourse();
			unsubAllModules();
		};
	});

	// 2. Active Module-level listener
	// Subscribes only to the active module document when moduleId changes
	$effect(() => {
		if (!courseId || !moduleId) return;
		void retryCount;

		loading = true;
		loadError = '';

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
				loadError = 'Failed to load lesson content. Please check network connection.';
				loading = false;
			}
		);

		// Fetch relevant YouTube video recommendations
		fetchVideos();

		return () => {
			unsubModule();
		};
	});

	const fetchVideos = async (refresh = false) => {
		if (!courseId || !moduleId) return;
		loadingVideos = true;
		try {
			const url = `/api/courses/${courseId}/modules/${moduleId}/videos${refresh ? '?refresh=true' : ''}`;
			const { data } = await apiFetch<{ videos?: typeof moduleVideos }>(url);
			moduleVideos = data.videos || [];
		} catch (err) {
			console.warn('Failed to fetch video recommendations:', err);
		} finally {
			loadingVideos = false;
		}
	};

	// Strip answer keys (correctIndex, answerIndex, explanation) from questions passed to client runner
	let sanitizedQuestions = $derived(
		(moduleData?.questions || []).map((q) => ({
			order: q.order,
			prompt: q.prompt || q.question || '',
			question: q.prompt || q.question || '',
			options: q.options || [],
			conceptId: q.conceptId,
			conceptTag: q.conceptTag
		}))
	);

	// Complete module and save progress
	const handleFinishModule = async (answers?: number[]) => {
		try {
			const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
			totalTimeSpentSeconds += elapsedSeconds;

			const { data } = await apiFetch<{
				streak?: { current: number };
				quizResult?: QuizGradedResult;
			}>(`/api/modules/${moduleId}/complete`, {
				method: 'POST',
				body: {
					courseId,
					timeSpentSeconds: totalTimeSpentSeconds,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					...(moduleData?.type === 'quiz' && answers ? { answers } : {})
				}
			});

			completionStreak = data.streak?.current;
			if (data.quizResult?.reviewItems) {
				quizReviewRecords = data.quizResult.reviewItems;
			}
			if (moduleData?.type !== 'quiz') {
				isCompleted = true;
			}
			return data.quizResult;
		} catch (err) {
			console.error('Error completing module:', err);
			toastStore.error(err instanceof Error ? err.message : 'Could not save progress.');
			throw err;
		}
	};

	// Granular Single Item Regeneration
	const handleRegenerateItem = async () => {
		if (isRegeneratingItem || !courseId || !moduleId || !moduleData) return;
		isRegeneratingItem = true;
		try {
			const itemType = moduleData.type === 'quiz' ? 'question' : 'page';
			const itemIndex = moduleData.type === 'quiz' ? 0 : currentPageIndex;

			await apiFetch(`/api/modules/${moduleId}/regenerate-item`, {
				method: 'POST',
				body: {
					courseId,
					itemType,
					itemIndex
				}
			});

			toastStore.success(`Single ${itemType} regenerated!`);
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
			await apiFetch('/api/flag', {
				method: 'POST',
				body: {
					courseId,
					moduleId,
					contentType: moduleData?.type || 'lesson',
					reason: flagReason
				}
			});

			toastStore.success('Content flagged for review. Thank you!');
			showFlagModal = false;
			flagReason = '';
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
			<div class="mt-4 flex items-center gap-3">
				<button
					type="button"
					onclick={() => retryFetch()}
					class="rounded-xl bg-danger px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-danger/90"
				>
					🔄 Try Again
				</button>
				<a
					href={`/app/courses/${courseId}`}
					class="rounded-xl border border-border bg-surface px-5 py-2 text-xs font-bold text-text-muted hover:text-text"
				>
					Back to Course
				</a>
			</div>
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
		{#if !quizStarted}
			<!-- Quiz Pre-Session Briefing Card -->
			<div
				class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
			>
				<div class="flex flex-col gap-2">
					<div
						class="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-[10px] font-black tracking-wider text-primary uppercase"
					>
						<span>🎯 Focused Assessment</span>
					</div>
					<h2 class="font-display text-xl font-bold text-text sm:text-2xl">
						{moduleData.title}
					</h2>
					<p class="text-xs leading-relaxed text-text-muted sm:text-sm">
						{moduleData.summary ||
							'Test your comprehension with adaptive questions, instant reasoning, and long-term memory scheduling.'}
					</p>
				</div>

				<!-- Quick Session Stats -->
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					<div class="rounded-2xl border border-border bg-surface-muted p-3.5">
						<span class="block text-[10px] font-bold text-text-muted uppercase">Questions</span>
						<span class="font-display text-base font-bold text-text">
							{moduleData.questions?.length || 0} Questions
						</span>
					</div>

					<div class="rounded-2xl border border-border bg-surface-muted p-3.5">
						<span class="block text-[10px] font-bold text-text-muted uppercase">Estimated Time</span
						>
						<span class="font-display text-base font-bold text-text">
							~{moduleData.estimatedMinutes ||
								(moduleData.questions?.length
									? Math.max(2, Math.ceil(moduleData.questions.length * 0.8))
									: 5)} mins
						</span>
					</div>

					<div
						class="col-span-2 rounded-2xl border border-border bg-surface-muted p-3.5 sm:col-span-1"
					>
						<span class="block text-[10px] font-bold text-text-muted uppercase">Difficulty</span>
						<span class="font-display text-base font-bold text-primary"> Adaptive FSRS </span>
					</div>
				</div>

				<!-- Concepts Covered Tag List -->
				{#if moduleData.concepts && moduleData.concepts.length > 0}
					<div class="flex flex-col gap-2 border-t border-border/80 pt-4">
						<span class="text-xs font-bold text-text">Key Concepts Tested:</span>
						<div class="flex flex-wrap gap-1.5">
							{#each moduleData.concepts as c, idx (c.id || c.term || idx)}
								<span
									class="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-text"
								>
									{c.term}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Start Quiz CTA -->
				<div class="flex items-center justify-between border-t border-border/80 pt-4">
					<span class="text-xs text-text-muted">Keyboard navigation [1-4, Enter] supported</span>
					<button
						type="button"
						onclick={() => (quizStarted = true)}
						class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-primary/20 shadow-md transition-all hover:bg-primary-hover active:scale-95"
					>
						<span>Start Quiz Practice &rarr;</span>
					</button>
				</div>
			</div>
		{:else}
			<!-- Adaptive Quiz Runner -->
			<QuizRunner
				courseId={courseId || ''}
				moduleId={moduleId || ''}
				moduleTitle={moduleData.title}
				questions={sanitizedQuestions}
				currentQuestionIndex={0}
				onComplete={handleFinishModule}
				onFinish={() => (isCompleted = true)}
				onRegenerateQuestion={handleRegenerateItem}
				onFlagContent={() => (showFlagModal = true)}
				isRegenerating={isRegeneratingItem}
			/>
		{/if}
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
					Help us improve learning quality. Let us know if you spotted incorrect information,
					formatting issues, or broken elements in this module.
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
