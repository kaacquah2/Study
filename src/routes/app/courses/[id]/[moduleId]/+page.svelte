<script lang="ts">
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import {
		doc,
		collection,
		onSnapshot,
		query,
		orderBy,
		type DocumentSnapshot
	} from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import PageIndicator from '$lib/components/PageIndicator.svelte';
	import CompletionScreen from '$lib/components/CompletionScreen.svelte';
	import LessonAudioPlayer from '$lib/components/LessonAudioPlayer.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { ModuleDoc, CourseDoc } from '$lib/firebase/converters';

	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.moduleId);

	let course = $state<CourseDoc | null>(null);
	let moduleData = $state<ModuleDoc | null>(null);
	let allModules = $state<ModuleDoc[]>([]);
	let loading = $state(true);
	let loadError = $state('');

	// Item #9: TOC Sidebar state
	let showTocSidebar = $state(false);

	// Item #12: Time-on-page tracking
	let pageStartTime = $state(Date.now());
	let totalTimeSpentSeconds = $state(0);

	// Lesson state
	let currentPageIndex = $state(0);

	// Quiz state
	let currentQuestionIndex = $state(0);
	let selectedOptionIndex = $state<number | null>(null);
	let isAnswerLocked = $state(false);
	let score = $state(0);

	// Item #10: Quiz End-of-Quiz Review state
	interface QuizReviewRecord {
		order: number;
		prompt: string;
		options: string[];
		correctIndex: number;
		selectedIndex: number | null;
		explanation: string;
	}
	let quizReviewItems = $state<QuizReviewRecord[]>([]);

	// Item #18: Single Item Regeneration state
	let isRegeneratingItem = $state(false);

	// Restore mid-quiz state from localStorage & Firestore
	$effect(() => {
		if (moduleId && courseId && moduleData?.type === 'quiz') {
			const storageKey = `quiz_progress_${moduleId}`;
			const saved = localStorage.getItem(storageKey);
			if (saved) {
				try {
					const data = JSON.parse(saved);
					if (typeof data.currentQuestionIndex === 'number') {
						currentQuestionIndex = data.currentQuestionIndex;
						score = data.score || 0;
						if (data.quizReviewItems) quizReviewItems = data.quizReviewItems;
					}
				} catch (e) {
					console.warn('Failed to restore quiz state from local cache:', e);
				}
			}

			// Fetch cross-device Firestore state
			(async () => {
				try {
					const idToken = await auth.currentUser?.getIdToken();
					if (!idToken) return;
					const res = await fetch(`/api/modules/${moduleId}/quiz-state?courseId=${courseId}`, {
						headers: { Authorization: `Bearer ${idToken}` }
					});
					if (res.ok) {
						const { state } = await res.json();
						if (state && typeof state.currentQuestionIndex === 'number') {
							currentQuestionIndex = state.currentQuestionIndex;
							score = state.score || 0;
						}
					}
				} catch (err) {
					console.warn('Failed to fetch cross-device quiz state:', err);
				}
			})();
		}
	});

	// Save quiz progress locally & sync to Firestore on change
	$effect(() => {
		if (moduleId && courseId && moduleData?.type === 'quiz' && !isCompleted) {
			const storageKey = `quiz_progress_${moduleId}`;
			localStorage.setItem(
				storageKey,
				JSON.stringify({ currentQuestionIndex, score, quizReviewItems })
			);

			// Debounced sync to Firestore
			const timer = setTimeout(async () => {
				try {
					const idToken = await auth.currentUser?.getIdToken();
					if (!idToken) return;
					await fetch(`/api/modules/${moduleId}/quiz-state`, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${idToken}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							courseId,
							currentQuestionIndex,
							score
						})
					});
				} catch (err) {
					console.warn('Failed to sync quiz state to backend:', err);
				}
			}, 1000);

			return () => clearTimeout(timer);
		}
	});

	// Completion Celebration state
	let isCompleted = $state(false);
	let completionStreak = $state<number | undefined>(undefined);
	let earnedBadges = $state<string[]>([]);

	$effect(() => {
		if (courseId && moduleId) {
			loading = true;
			loadError = '';

			const courseRef = doc(db, 'courses', courseId);
			const unsubCourse = onSnapshot(
				courseRef,
				(snap: DocumentSnapshot) => {
					if (snap.exists()) {
						course = snap.data() as CourseDoc;
					}
				},
				(err: Error) => console.error('Course listener error:', err)
			);

			const modRef = doc(db, `courses/${courseId}/modules/${moduleId}`);
			const unsubMod = onSnapshot(
				modRef,
				(snap: DocumentSnapshot) => {
					if (snap.exists()) {
						moduleData = snap.data() as ModuleDoc;
					} else {
						loadError = 'Module not found.';
					}
					loading = false;
				},
				(err: Error) => {
					console.error('Module listener error:', err);
					loadError = 'Failed to load module content.';
					loading = false;
				}
			);

			// Fetch all modules for Next Module CTA calculation (Item #13)
			const modulesRef = collection(db, 'courses', courseId, 'modules');
			const q = query(modulesRef, orderBy('order', 'asc'));
			const unsubModules = onSnapshot(q, (snap) => {
				const mods = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ModuleDoc[];
				mods.sort((a, b) => (a.order || 0) - (b.order || 0));
				allModules = mods;
			});

			return () => {
				unsubCourse();
				unsubMod();
				unsubModules();
			};
		}
	});

	// Item #13: Calculate Next Module Details
	let nextModule = $derived.by(() => {
		if (!allModules.length || !moduleId) return null;
		const currentIndex = allModules.findIndex((m) => m.id === moduleId);
		if (currentIndex !== -1 && currentIndex < allModules.length - 1) {
			return allModules[currentIndex + 1];
		}
		return null;
	});

	// Lesson derivations
	let lessonPages = $derived(moduleData?.pages || []);
	let activeLessonPage = $derived(lessonPages[currentPageIndex] || null);
	let renderedBody = $derived.by(() => {
		if (activeLessonPage?.body) {
			return DOMPurify.sanitize(marked.parse(activeLessonPage.body) as string);
		}
		return '';
	});

	// Quiz derivations
	interface QuizQuestionItem {
		order?: number;
		prompt?: string;
		question?: string;
		options: string[];
		answerIndex?: number;
		correctIndex?: number;
		explanation?: string;
	}

	let quizQuestions = $derived(moduleData?.questions || []);
	let activeQuizQuestion = $derived<QuizQuestionItem | null>(
		(quizQuestions[currentQuestionIndex] as unknown as QuizQuestionItem) || null
	);

	// Submit module completion to backend
	const finishModule = async () => {
		try {
			// Record elapsed time spent
			const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
			totalTimeSpentSeconds += elapsedSeconds;

			if (moduleId) {
				localStorage.removeItem(`quiz_progress_${moduleId}`);
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
						? { quizScore: score, quizTotal: quizQuestions.length }
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
			toastStore.error('Could not save progress');
			isCompleted = true;
		}
	};

	const handleLessonNext = () => {
		const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
		totalTimeSpentSeconds += elapsedSeconds;
		pageStartTime = Date.now();

		if (currentPageIndex < lessonPages.length - 1) {
			currentPageIndex += 1;
		} else {
			finishModule();
		}
	};

	const handleLessonPrev = () => {
		if (currentPageIndex > 0) {
			currentPageIndex -= 1;
			pageStartTime = Date.now();
		}
	};

	// Item #11: Tap option to select option, then click Confirm Answer button to lock!
	const handleSelectOption = (idx: number) => {
		if (isAnswerLocked || !activeQuizQuestion) return;
		selectedOptionIndex = idx;
	};

	const handleConfirmAnswer = () => {
		if (isAnswerLocked || selectedOptionIndex === null || !activeQuizQuestion) return;
		isAnswerLocked = true;

		const correctIdx = activeQuizQuestion.answerIndex ?? activeQuizQuestion.correctIndex ?? 0;

		if (selectedOptionIndex === correctIdx) {
			score += 1;
		}

		// Item #10: Store record for end-of-quiz comprehensive review
		quizReviewItems = [
			...quizReviewItems,
			{
				order: currentQuestionIndex + 1,
				prompt: activeQuizQuestion.prompt || activeQuizQuestion.question || '',
				options: activeQuizQuestion.options,
				correctIndex: correctIdx,
				selectedIndex: selectedOptionIndex,
				explanation: activeQuizQuestion.explanation || ''
			}
		];
	};

	const handleQuizNext = () => {
		if (currentQuestionIndex < quizQuestions.length - 1) {
			currentQuestionIndex += 1;
			selectedOptionIndex = null;
			isAnswerLocked = false;
		} else {
			finishModule();
		}
	};

	// Item #18: Granular Question or Page AI Regeneration
	const handleRegenerateItem = async () => {
		if (isRegeneratingItem || !courseId || !moduleId || !moduleData) return;
		isRegeneratingItem = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const itemType = moduleData.type === 'quiz' ? 'question' : 'page';
			const itemIndex = moduleData.type === 'quiz' ? currentQuestionIndex : currentPageIndex;

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

	const handleFlagContent = async () => {
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
					reason: 'User flagged module content for review'
				})
			});

			if (res.ok) {
				toastStore.success('Content flagged for review. Thank you!');
			} else {
				toastStore.error('Failed to flag content');
			}
		} catch (err) {
			console.error('Flag content error:', err);
			toastStore.error('Error submitting content flag');
		}
	};
</script>

<svelte:head>
	<title>{moduleData?.title || 'Study Module'} &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4">
	<!-- Top Navigation Bar & Tools -->
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
		<div class="flex items-center gap-3">
			<a
				href={resolve(`/app/courses/${courseId}` as '/app')}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
			>
				&larr; Course Overview
			</a>

			<!-- Item #9: Lesson TOC Sidebar Toggle Button -->
			{#if moduleData?.type === 'lesson' && lessonPages.length > 1}
				<button
					type="button"
					onclick={() => (showTocSidebar = !showTocSidebar)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-2xs hover:border-primary/50"
				>
					<span>📖 Contents ({lessonPages.length} Pages)</span>
				</button>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<!-- Item #18: Granular Item AI Regeneration Button -->
			{#if moduleData && !isCompleted}
				<button
					type="button"
					onclick={handleRegenerateItem}
					disabled={isRegeneratingItem}
					title="Regenerate this specific page or question with AI"
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft/40 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95 disabled:opacity-40"
				>
					{#if isRegeneratingItem}
						<span
							class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
						></span>
						<span>Regenerating...</span>
					{:else}
						<span>✨ Regenerate {moduleData.type === 'quiz' ? 'Question' : 'Page'}</span>
					{/if}
				</button>
			{/if}

			{#if moduleData && !isCompleted}
				<PageIndicator
					current={moduleData.type === 'lesson' ? currentPageIndex + 1 : currentQuestionIndex + 1}
					total={moduleData.type === 'lesson' ? lessonPages.length : quizQuestions.length}
					label={moduleData.type === 'lesson' ? 'Page' : 'Question'}
				/>
			{/if}
		</div>
	</div>

	<!-- Item #9: Lesson Table of Contents Drawer/Sidebar -->
	{#if showTocSidebar && moduleData?.type === 'lesson'}
		<div class="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-surface p-4 shadow-md">
			<div class="flex items-center justify-between border-b border-border/40 pb-2">
				<span class="font-display text-xs font-bold text-text">Lesson Table of Contents</span>
				<button
					type="button"
					onclick={() => (showTocSidebar = false)}
					class="text-xs font-bold text-text-muted hover:text-text"
				>
					✕ Close
				</button>
			</div>

			<div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
				{#each lessonPages as p, idx (idx)}
					<button
						type="button"
						onclick={() => {
							currentPageIndex = idx;
							showTocSidebar = false;
						}}
						class="flex items-center justify-between rounded-xl border p-2.5 text-left text-xs font-semibold transition-all {currentPageIndex ===
						idx
							? 'border-primary bg-primary-soft text-primary'
							: 'border-border bg-surface-muted/30 text-text-muted hover:border-primary/40'}"
					>
						<span class="truncate">Page {idx + 1}: {p.heading || `Section ${idx + 1}`}</span>
						{#if idx < currentPageIndex}
							<span class="text-xs font-bold text-emerald-400">✓</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if loading}
		<Skeleton variant="card" height="h-96" />
	{:else if loadError || !moduleData}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{loadError || 'Module not found.'}
		</div>
	{:else if isCompleted}
		<CompletionScreen
			title={moduleData.type === 'lesson'
				? 'Lesson Completed!'
				: `Quiz Complete (${score}/${quizQuestions.length})`}
			subtitle={moduleData.type === 'lesson'
				? 'You have successfully read and mastered this lesson.'
				: 'Great job testing your knowledge!'}
			streakCount={completionStreak}
			{earnedBadges}
			nextModuleId={nextModule?.id}
			nextModuleTitle={nextModule?.title}
			{quizReviewItems}
			onContinue={() => goto(resolve(`/app/courses/${courseId}`))}
			onNextModule={(nextId) => goto(resolve(`/app/courses/${courseId}/${nextId}`))}
		/>
	{:else if moduleData.type === 'lesson'}
		<!-- LESSON VIEW -->
		<div
			class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-10"
		>
			<!-- Header -->
			<div class="flex items-start justify-between border-b border-border/40 pb-4">
				<div>
					<span class="text-[10px] font-bold tracking-wider text-primary uppercase">
						{course?.title || 'Course Lesson'}
					</span>
					<h1 class="mt-1 font-display text-2xl font-bold text-text">{moduleData.title}</h1>
					{#if activeLessonPage?.subheading}
						<h2 class="mt-1 text-xs font-semibold text-text-muted">
							{activeLessonPage.subheading}
						</h2>
					{/if}
				</div>
				<button
					type="button"
					onclick={handleFlagContent}
					title="Flag lesson content"
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-all hover:border-danger hover:text-danger active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
						/>
					</svg>
					<span>Flag</span>
				</button>
			</div>

			<!-- Audio Narration Player -->
			{#if activeLessonPage?.body}
				<LessonAudioPlayer
					text={activeLessonPage.body}
					title={activeLessonPage.heading || moduleData.title}
				/>
			{/if}

			<!-- Markdown Body -->
			<div class="prose prose-sm max-w-none leading-relaxed text-text">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderedBody}
			</div>

			<!-- Bottom Lesson Controls -->
			<div class="mt-4 flex items-center justify-between border-t border-border/40 pt-6">
				<button
					type="button"
					onclick={handleLessonPrev}
					disabled={currentPageIndex === 0}
					class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text hover:bg-surface-muted disabled:opacity-30"
				>
					&larr; Previous Page
				</button>

				<button
					type="button"
					onclick={handleLessonNext}
					class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-hover active:scale-98"
				>
					<span>{currentPageIndex === lessonPages.length - 1 ? 'Finish Lesson' : 'Next Page'}</span>
					<span>&rarr;</span>
				</button>
			</div>
		</div>
	{:else if moduleData.type === 'quiz'}
		<!-- QUIZ VIEW -->
		<div
			class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-10"
		>
			<div class="flex items-center justify-between border-b border-border/40 pb-4">
				<div>
					<span class="text-[10px] font-bold tracking-wider text-primary uppercase"
						>Interactive Quiz</span
					>
					<h1 class="font-display text-xl font-bold text-text">{moduleData.title}</h1>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={handleFlagContent}
						title="Flag quiz question"
						class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-all hover:border-danger hover:text-danger active:scale-95"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
							/>
						</svg>
						<span>Flag</span>
					</button>
					<div
						class="rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-bold text-text"
					>
						Score: {score}
					</div>
				</div>
			</div>

			{#if activeQuizQuestion}
				<!-- Question Markdown -->
				<div class="font-display text-base font-bold text-text">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html DOMPurify.sanitize(
						marked.parse(activeQuizQuestion.prompt || activeQuizQuestion.question || '') as string
					)}
				</div>

				<!-- Options List -->
				<div class="flex flex-col gap-3">
					{#each activeQuizQuestion.options as option, idx (idx)}
						{@const isSelected = selectedOptionIndex === idx}
						{@const correctIdx =
							activeQuizQuestion.answerIndex ?? activeQuizQuestion.correctIndex ?? 0}
						{@const isCorrect = idx === correctIdx}

						<button
							type="button"
							onclick={() => handleSelectOption(idx)}
							disabled={isAnswerLocked}
							class="flex w-full cursor-pointer items-center justify-between rounded-2xl border p-4 text-left text-xs font-semibold transition-all duration-180 {isAnswerLocked
								? isCorrect
									? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
									: isSelected
										? 'border-rose-500 bg-rose-500/10 text-rose-300'
										: 'border-border/40 bg-surface-muted/30 opacity-50'
								: isSelected
									? 'border-primary bg-primary-soft text-primary'
									: 'border-border bg-surface hover:border-primary/50 hover:bg-surface-muted/40'}"
						>
							<div class="flex items-center gap-3">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-[10px] font-bold text-text-muted"
								>
									{String.fromCharCode(65 + idx)}
								</span>
								<span>{option}</span>
							</div>

							{#if isAnswerLocked}
								{#if isCorrect}
									<span class="font-bold text-emerald-400">✓ Correct</span>
								{:else if isSelected}
									<span class="font-bold text-rose-400">&times; Incorrect</span>
								{/if}
							{/if}
						</button>
					{/each}
				</div>

				<!-- Item #11: Confirm Answer button before locking -->
				{#if !isAnswerLocked && selectedOptionIndex !== null}
					<div class="flex justify-end pt-2">
						<button
							type="button"
							onclick={handleConfirmAnswer}
							class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95"
						>
							<span>Confirm Answer</span>
							<span>✓</span>
						</button>
					</div>
				{/if}

				<!-- Answer Explanation after locked -->
				{#if isAnswerLocked && activeQuizQuestion.explanation}
					<div
						class="rounded-2xl border border-primary/20 bg-primary-soft/30 p-4 text-xs leading-relaxed text-text"
					>
						<span class="font-bold text-primary">Explanation:</span>
						{activeQuizQuestion.explanation}
					</div>
				{/if}

				<!-- Next Question CTA -->
				{#if isAnswerLocked}
					<div class="flex justify-end border-t border-border/40 pt-4">
						<button
							type="button"
							onclick={handleQuizNext}
							class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-hover active:scale-98"
						>
							<span
								>{currentQuestionIndex === quizQuestions.length - 1
									? 'Finish Quiz'
									: 'Next Question'}</span
							>
							<span>&rarr;</span>
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
