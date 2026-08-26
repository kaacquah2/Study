<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	export interface QuizQuestion {
		order?: number;
		prompt?: string;
		question?: string;
		options: string[];
		answerIndex?: number;
		correctIndex?: number;
		explanation?: string;
		conceptId?: string;
		conceptTag?: string;
	}

	export interface QuizReviewRecord {
		order: number;
		prompt: string;
		options: string[];
		correctIndex: number;
		selectedIndex: number | null;
		explanation: string;
		conceptId?: string;
	}

	interface Props {
		courseId: string;
		moduleId: string;
		moduleTitle: string;
		questions: QuizQuestion[];
		currentQuestionIndex?: number;
		initialScore?: number;
		initialReviewItems?: QuizReviewRecord[];
		onAnswer?: (questionIndex: number, selectedIndex: number, isCorrect: boolean) => void;
		onComplete: (finalScore: number, reviewItems: QuizReviewRecord[]) => void;
		onRegenerateQuestion?: () => void;
		onFlagContent?: () => void;
		isRegenerating?: boolean;
	}

	let {
		courseId,
		moduleId,
		moduleTitle,
		questions = [],
		currentQuestionIndex = 0,
		initialScore = 0,
		initialReviewItems = [],
		onAnswer,
		onComplete,
		onRegenerateQuestion,
		onFlagContent,
		isRegenerating = false
	}: Props = $props();

	let selectedOptionIndex = $state<number | null>(null);
	let isAnswerLocked = $state(false);
	let score = $state(0);
	let quizReviewItems = $state<QuizReviewRecord[]>([]);

	$effect(() => {
		score = initialScore;
		quizReviewItems = initialReviewItems;
		if (moduleId) {
			studySessionStore.setModule(moduleId, moduleTitle);
		}
	});

	// Streaming AI explanation state
	let aiExplanation = $state('');
	let isExplaining = $state(false);

	let activeQuestion = $derived(questions[currentQuestionIndex] || null);
	let correctIndex = $derived(
		activeQuestion ? (activeQuestion.answerIndex ?? activeQuestion.correctIndex ?? 0) : 0
	);
	let questionPrompt = $derived(
		activeQuestion ? (activeQuestion.prompt || activeQuestion.question || '') : ''
	);

	// Keyboard shortcuts
	onMount(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (isAnswerLocked) {
				if (e.key === 'Enter' || e.key === 'ArrowRight') {
					handleNextQuestion();
				}
				return;
			}

			if (e.key === '1') handleSelectOption(0);
			else if (e.key === '2') handleSelectOption(1);
			else if (e.key === '3') handleSelectOption(2);
			else if (e.key === '4') handleSelectOption(3);
			else if (e.key === 'Enter' && selectedOptionIndex !== null) {
				handleConfirmAnswer();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	const handleSelectOption = (index: number) => {
		if (isAnswerLocked) return;
		selectedOptionIndex = index;
	};

	const handleConfirmAnswer = () => {
		if (isAnswerLocked || selectedOptionIndex === null || !activeQuestion) return;
		isAnswerLocked = true;

		const isCorrect = selectedOptionIndex === correctIndex;
		if (isCorrect) {
			score += 1;
		}

		// Record in quiz review collection
		const reviewRecord: QuizReviewRecord = {
			order: currentQuestionIndex + 1,
			prompt: questionPrompt,
			options: activeQuestion.options,
			correctIndex,
			selectedIndex: selectedOptionIndex,
			explanation: activeQuestion.explanation || '',
			conceptId: activeQuestion.conceptId || activeQuestion.conceptTag
		};

		quizReviewItems = [...quizReviewItems, reviewRecord];

		// Log into session working memory
		studySessionStore.recordEvent({
			type: 'quiz_answered',
			snippet: questionPrompt,
			conceptId: activeQuestion.conceptId,
			summary: isCorrect ? 'Answered correctly' : `Answered incorrectly (chose option ${selectedOptionIndex + 1})`
		});

		// Dispatch authoritative learning event and mistake record if incorrect
		studySessionStore.dispatchServerEvent({
			eventType: 'question_answered',
			result: isCorrect ? 'correct' : 'incorrect',
			conceptId: activeQuestion.conceptId || activeQuestion.conceptTag,
			courseId,
			moduleId,
			questionId: `${moduleId}_q${currentQuestionIndex}`,
			questionSnapshot: {
				prompt: questionPrompt,
				options: activeQuestion.options,
				correctIndex,
				explanation: activeQuestion.explanation || ''
			},
			selectedIndex: selectedOptionIndex,
			metadata: {
				sourceLabel: moduleTitle
			}
		});

		onAnswer?.(currentQuestionIndex, selectedOptionIndex, isCorrect);
	};

	const handleNextQuestion = () => {
		aiExplanation = '';
		isExplaining = false;
		if (currentQuestionIndex < questions.length - 1) {
			currentQuestionIndex += 1;
			selectedOptionIndex = null;
			isAnswerLocked = false;
		} else {
			onComplete(score, quizReviewItems);
		}
	};

	// Request SSE streaming step explanation
	const handleRequestExplanation = async () => {
		if (!activeQuestion || selectedOptionIndex === null || isExplaining) return;
		isExplaining = true;
		aiExplanation = '';

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/quiz/explain', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					Accept: 'text/event-stream'
				},
				body: JSON.stringify({
					question: questionPrompt,
					userAnswer: activeQuestion.options[selectedOptionIndex],
					correctAnswer: activeQuestion.options[correctIndex],
					lessonContext: `${courseId ? `Course: ${courseId} - ` : ''}${moduleTitle}`,
					stream: true
				})
			});

			if (!res.ok) throw new Error('Explanation failed');

			if (res.body) {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (trimmed.startsWith('data: ')) {
							try {
								const payload = JSON.parse(trimmed.slice(6));
								if (payload.type === 'delta' && payload.content) {
									aiExplanation += payload.content;
								}
							} catch (e) {
								console.error('SSE parse error:', e);
							}
						}
					}
				}
			}
		} catch (err) {
			console.error('Explanation stream error:', err);
			toastStore.error('Could not load AI explanation.');
			aiExplanation =
				activeQuestion.explanation || 'No step-by-step explanation available for this question.';
		} finally {
			isExplaining = false;
		}
	};

	let progressPct = $derived(
		questions.length > 0
			? Math.min(100, Math.round(((currentQuestionIndex + (isAnswerLocked ? 1 : 0)) / questions.length) * 100))
			: 0
	);

	let questionsAnsweredCount = $derived(
		currentQuestionIndex + (isAnswerLocked ? 1 : 0)
	);
</script>

<div class="flex w-full flex-col gap-5">
	<!-- Top Bar with Progress -->
	<div class="flex flex-col gap-2.5 border-b border-border pb-3.5">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2.5">
				<span class="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
					Question {currentQuestionIndex + 1} of {questions.length}
				</span>
				<span class="text-xs font-semibold text-text-muted">
					Score: {score}/{questions.length}
					{#if questionsAnsweredCount > 0}
						<span class="text-text-muted/60">({Math.round((score / questionsAnsweredCount) * 100)}% accuracy)</span>
					{/if}
				</span>
			</div>

			<div class="flex items-center gap-2">
				{#if onFlagContent}
					<button
						type="button"
						onclick={onFlagContent}
						class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-danger hover:text-danger active:scale-95"
						title="Report issue with this quiz"
					>
						🚩 Report
					</button>
				{/if}

				{#if onRegenerateQuestion}
					<button
						type="button"
						onclick={onRegenerateQuestion}
						disabled={isRegenerating}
						class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft/50 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-white disabled:opacity-50"
						title="Regenerate this specific question with AI"
					>
						{#if isRegenerating}
							<span class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
							></span>
							<span>Regenerating...</span>
						{:else}
							<span>✨ Regenerate Question</span>
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<!-- Animated Progress Bar -->
		<div
			class="h-1.5 w-full overflow-hidden rounded-full bg-border/60"
			role="progressbar"
			aria-valuenow={currentQuestionIndex + 1}
			aria-valuemin={1}
			aria-valuemax={questions.length}
		>
			<div
				class="h-full rounded-full bg-primary transition-all duration-300"
				style="width: {progressPct}%"
			></div>
		</div>
	</div>

	<!-- Question Card -->
	{#if activeQuestion}
		<div
			class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
		>
			<h3 class="font-display text-lg font-bold text-text sm:text-xl">
				{questionPrompt}
			</h3>

			<!-- Option List -->
			<div class="flex flex-col gap-3">
				{#each activeQuestion.options as option, idx (idx)}
					{@const isSelected = selectedOptionIndex === idx}
					{@const isCorrectOption = isAnswerLocked && idx === correctIndex}
					{@const isWrongSelection = isAnswerLocked && isSelected && idx !== correctIndex}

					<button
						type="button"
						onclick={() => handleSelectOption(idx)}
						disabled={isAnswerLocked}
						class="flex w-full cursor-pointer items-center justify-between rounded-2xl border p-4 text-left text-xs font-medium transition-all duration-180 sm:text-sm
						{isCorrectOption
							? 'border-emerald-500 bg-emerald-500/10 font-bold text-emerald-400 shadow-xs'
							: isWrongSelection
								? 'anim-shake border-danger bg-danger/10 font-bold text-danger'
								: isSelected
									? 'border-primary bg-primary-soft font-bold text-primary ring-2 ring-primary/40'
									: 'border-border bg-surface hover:border-text-muted hover:bg-surface-muted/60 text-text'}"
					>
						<div class="flex items-center gap-3">
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold
								{isCorrectOption
									? 'bg-emerald-500 text-slate-950'
									: isWrongSelection
										? 'bg-danger text-white'
										: isSelected
											? 'bg-primary text-white'
											: 'bg-surface-muted text-text-muted'}"
							>
								{['A', 'B', 'C', 'D'][idx]}
							</span>
							<span>{option}</span>
						</div>

						{#if isCorrectOption}
							<span class="text-sm font-bold text-emerald-400">✓ Correct</span>
						{:else if isWrongSelection}
							<span class="text-sm font-bold text-danger">✕ Incorrect</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Post-Answer Feedback & AI Explanation Section -->
			{#if isAnswerLocked}
				<div class="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface-muted/60 p-4">
					{#if selectedOptionIndex === correctIndex}
						<div class="flex items-center gap-2 text-xs font-bold text-emerald-400">
							<span>🎉 Great job! That's correct.</span>
						</div>
					{:else}
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs font-bold text-danger"
								>Incorrect. The correct answer was option {['A', 'B', 'C', 'D'][correctIndex]}.</span
							>
							{#if !aiExplanation && !isExplaining}
								<button
									type="button"
									onclick={handleRequestExplanation}
									class="cursor-pointer rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary hover:text-white"
								>
									🤖 Explain My Mistake
								</button>
							{/if}
						</div>
					{/if}

					<!-- Explanation Text -->
					{#if activeQuestion.explanation && !aiExplanation}
						<p class="text-xs leading-relaxed text-text-muted">
							<strong class="text-text">Explanation:</strong> {activeQuestion.explanation}
						</p>
					{/if}

					<!-- Streaming AI Explanation -->
					{#if isExplaining || aiExplanation}
						<div class="mt-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-3.5 text-xs">
							<div class="mb-1.5 flex items-center gap-2 font-bold text-primary">
								<span>🤖 AI Tutor Reasoning:</span>
								{#if isExplaining}
									<span class="h-2 w-2 animate-ping rounded-full bg-primary"></span>
								{/if}
							</div>
							<div class="prose dark:prose-invert text-xs leading-relaxed text-text">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html DOMPurify.sanitize(marked.parse(aiExplanation) as string)}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Bottom Action Confirmation -->
	<div class="flex items-center justify-between pt-2">
		<span class="text-[11px] font-semibold text-text-muted">
			Keyboard: Keys [1-4] to select, [Enter] to submit
		</span>

		{#if !isAnswerLocked}
			<button
				type="button"
				onclick={handleConfirmAnswer}
				disabled={selectedOptionIndex === null}
				class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
			>
				<span>Confirm Answer &rarr;</span>
			</button>
		{:else}
			<button
				type="button"
				onclick={handleNextQuestion}
				class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
			>
				<span>{currentQuestionIndex < questions.length - 1 ? 'Next Question &rarr;' : 'Finish Quiz 🏁'}</span>
			</button>
		{/if}
	</div>
</div>
