<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	export interface QuizQuestion {
		order?: number;
		prompt?: string;
		question?: string;
		options: string[];
		conceptId?: string;
		conceptTag?: string;
	}

	export interface QuizReviewRecord {
		order: number;
		prompt: string;
		options: string[];
		correctIndex: number;
		selectedIndex: number | null;
		isCorrect?: boolean;
		explanation: string;
		conceptId?: string;
	}

	export interface QuizGradedResult {
		score: number;
		total: number;
		accuracy: number;
		reviewItems: QuizReviewRecord[];
	}

	interface Props {
		courseId: string;
		moduleId: string;
		moduleTitle: string;
		questions: QuizQuestion[];
		currentQuestionIndex?: number;
		onAnswer?: (questionIndex: number, selectedIndex: number) => void;
		onComplete: (answers: number[]) => Promise<QuizGradedResult | void> | void;
		onFinish?: () => void;
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
		onAnswer,
		onComplete,
		onFinish,
		onRegenerateQuestion,
		onFlagContent,
		isRegenerating = false
	}: Props = $props();

	let activeQuestionIndex = $state(0);
	let userAnswers = $state<Array<number | null>>([]);
	let isSubmittingQuiz = $state(false);

	$effect(() => {
		if (typeof currentQuestionIndex === 'number') {
			activeQuestionIndex = currentQuestionIndex;
		}
	});

	// Peer-questions state — shown on quiz completion screen
	interface PeerQuestion {
		id: string;
		question: string;
		options: string[];
		correctAnswer: number;
		explanation?: string;
		submittedBy: string;
	}
	let quizFinished = $state(false);
	let finalScore = $state(0);
	let finalReviewItems = $state<QuizReviewRecord[]>([]);
	let communityQuestions = $state<PeerQuestion[]>([]);
	let loadingCommunityQs = $state(false);
	let showSuggestForm = $state(false);
	let suggestQuestion = $state('');
	let suggestOptions = $state(['', '', '', '']);
	let suggestCorrect = $state(0);
	let suggestExplanation = $state('');
	let submittingSuggestion = $state(false);

	// Streaming AI explanation state for post-submission review
	let reviewingItemIndex = $state<number | null>(null);
	let aiExplanation = $state('');
	let isExplaining = $state(false);

	function getOptionLabel(index: number): string {
		return String.fromCharCode(65 + index);
	}

	$effect(() => {
		if (userAnswers.length !== questions.length) {
			userAnswers = new Array(questions.length).fill(null);
		}
		if (moduleId) {
			studySessionStore.setModule(moduleId, moduleTitle);
		}
	});

	let activeQuestion = $derived(questions[activeQuestionIndex] || null);
	let selectedOptionIndex = $derived(userAnswers[activeQuestionIndex] ?? null);
	let questionPrompt = $derived(
		activeQuestion ? activeQuestion.prompt || activeQuestion.question || '' : ''
	);

	let answeredCount = $derived(userAnswers.filter((a) => a !== null).length);
	let isAllAnswered = $derived(
		questions.length > 0 &&
			userAnswers.length === questions.length &&
			userAnswers.every((a) => a !== null)
	);

	const fetchCommunityQuestions = async () => {
		if (!courseId) return;
		loadingCommunityQs = true;
		try {
			const { data } = await apiFetch<{ questions?: PeerQuestion[] }>(
				`/api/courses/peer-questions?courseId=${encodeURIComponent(courseId)}`
			);
			communityQuestions = data.questions || [];
		} catch (err) {
			console.warn('Could not load community questions:', err);
		} finally {
			loadingCommunityQs = false;
		}
	};

	const handleSubmitSuggestion = async () => {
		if (submittingSuggestion) return;
		if (!suggestQuestion.trim() || suggestOptions.filter((o) => o.trim()).length < 2) {
			toastStore.error('Enter a question and at least 2 answer options.');
			return;
		}
		submittingSuggestion = true;
		try {
			await apiFetch('/api/courses/peer-questions', {
				method: 'POST',
				body: {
					courseId,
					question: suggestQuestion.trim(),
					options: suggestOptions.map((o) => o.trim()).filter(Boolean),
					correctAnswer: suggestCorrect,
					explanation: suggestExplanation.trim()
				}
			});
			toastStore.success('Question submitted for review — thanks for contributing! 🙌');
			suggestQuestion = '';
			suggestOptions = ['', '', '', ''];
			suggestCorrect = 0;
			suggestExplanation = '';
			showSuggestForm = false;
		} catch (err) {
			console.error('Peer question submission error:', err);
			toastStore.error('Could not submit question. Please try again.');
		} finally {
			submittingSuggestion = false;
		}
	};

	const handleSelectOption = (index: number) => {
		if (isSubmittingQuiz || quizFinished) return;
		const updated = [...userAnswers];
		updated[activeQuestionIndex] = index;
		userAnswers = updated;
		onAnswer?.(activeQuestionIndex, index);
	};

	const handleNextQuestion = () => {
		if (activeQuestionIndex < questions.length - 1) {
			activeQuestionIndex += 1;
		}
	};

	const handlePrevQuestion = () => {
		if (activeQuestionIndex > 0) {
			activeQuestionIndex -= 1;
		}
	};

	const handleSubmitQuiz = async () => {
		if (isSubmittingQuiz || !isAllAnswered) return;
		isSubmittingQuiz = true;

		try {
			const answers = userAnswers.map((a) => (typeof a === 'number' ? a : 0));
			const res = await onComplete(answers);

			if (res && 'score' in res) {
				finalScore = res.score;
				finalReviewItems = res.reviewItems || [];
				quizFinished = true;
				fetchCommunityQuestions();
			}
		} catch (err) {
			console.error('Quiz submission error:', err);
			toastStore.error('Could not submit quiz answers. Please try again.');
		} finally {
			isSubmittingQuiz = false;
		}
	};

	const handleFinishAndComplete = () => {
		if (onFinish) {
			onFinish();
		}
	};

	// Request SSE streaming step explanation for post-quiz review item
	const handleRequestExplanation = async (reviewItem: QuizReviewRecord, itemIdx: number) => {
		if (isExplaining) return;
		reviewingItemIndex = itemIdx;
		isExplaining = true;
		aiExplanation = '';

		try {
			const { raw } = await apiFetch('/api/quiz/explain', {
				method: 'POST',
				responseType: 'stream',
				headers: {
					Accept: 'text/event-stream'
				},
				body: {
					question: reviewItem.prompt,
					userAnswer:
						reviewItem.selectedIndex !== null
							? reviewItem.options[reviewItem.selectedIndex]
							: 'Skipped',
					correctAnswer: reviewItem.options[reviewItem.correctIndex],
					lessonContext: `${courseId ? `Course: ${courseId} - ` : ''}${moduleTitle}`,
					stream: true
				}
			});

			if (raw?.body) {
				const reader = raw.body.getReader();
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
				reviewItem.explanation || 'No step-by-step explanation available for this question.';
		} finally {
			isExplaining = false;
		}
	};

	// Keyboard shortcuts
	onMount(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (quizFinished || isSubmittingQuiz) return;
			const target = e.target as HTMLElement;
			if (target?.matches('input, textarea, select, [contenteditable]')) return;

			if (e.key >= '1' && e.key <= '9') {
				const optIdx = parseInt(e.key, 10) - 1;
				if (activeQuestion && optIdx < activeQuestion.options.length) {
					handleSelectOption(optIdx);
				}
			} else if (
				(e.key === 'ArrowRight' || e.key === 'n') &&
				activeQuestionIndex < questions.length - 1
			) {
				handleNextQuestion();
			} else if ((e.key === 'ArrowLeft' || e.key === 'p') && activeQuestionIndex > 0) {
				handlePrevQuestion();
			} else if (e.key === 'Enter') {
				if (activeQuestionIndex < questions.length - 1) {
					handleNextQuestion();
				} else if (isAllAnswered) {
					handleSubmitQuiz();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	let progressPct = $derived(
		questions.length > 0 ? Math.min(100, Math.round((answeredCount / questions.length) * 100)) : 0
	);
</script>

<div class="flex w-full flex-col gap-5">
	<!-- Quiz Finished: Score + Authoritative Review + Community Questions screen -->
	{#if quizFinished}
		<div class="flex flex-col gap-6">
			<!-- Score Summary -->
			<div
				class="flex flex-col items-center gap-4 rounded-3xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8"
			>
				<span class="text-4xl"
					>{finalScore === questions.length
						? '🏆'
						: finalScore >= questions.length * 0.7
							? '🎉'
							: '📚'}</span
				>
				<div>
					<h2 class="font-display text-xl font-bold text-text sm:text-2xl">Quiz Complete!</h2>
					<p class="mt-1 text-sm text-text-muted">
						You scored <strong class="text-text">{finalScore}/{questions.length}</strong>
						({Math.round((finalScore / Math.max(questions.length, 1)) * 100)}% accuracy)
					</p>
				</div>
				<button
					type="button"
					id="quiz-continue-btn"
					onclick={handleFinishAndComplete}
					class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-xs font-bold text-white shadow-primary/20 shadow-md transition-all hover:bg-primary-hover active:scale-95"
				>
					Continue &rarr;
				</button>
			</div>

			<!-- Question-by-Question Review Breakdown -->
			{#if finalReviewItems.length > 0}
				<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-base">📋</span>
							<h3 class="font-display text-sm font-bold text-text">
								Question Breakdown & Solutions
							</h3>
						</div>
						<span class="text-xs font-semibold text-text-muted">
							{finalScore} of {finalReviewItems.length} correct
						</span>
					</div>

					<div class="flex flex-col gap-4">
						{#each finalReviewItems as item, idx (item.order || idx)}
							{@const isCorrect = item.selectedIndex === item.correctIndex}
							<div
								class="flex flex-col gap-3 rounded-2xl border p-4 transition-all {isCorrect
									? 'border-emerald-500/30 bg-emerald-500/5'
									: 'border-danger/30 bg-danger/5'}"
							>
								<div class="flex items-start justify-between gap-2">
									<div class="flex items-start gap-2">
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold {isCorrect
												? 'bg-emerald-500 text-slate-950'
												: 'bg-danger text-white'}"
										>
											{isCorrect ? '✓' : '✕'}
										</span>
										<span class="text-xs font-bold text-text">
											Q{item.order}: {item.prompt}
										</span>
									</div>
									<span
										class="rounded-full px-2 py-0.5 text-[10px] font-bold {isCorrect
											? 'bg-emerald-500/20 text-emerald-400'
											: 'bg-danger/20 text-danger'}"
									>
										{isCorrect ? 'Correct' : 'Incorrect'}
									</span>
								</div>

								<!-- Options list -->
								<div class="flex flex-col gap-1.5 pl-7">
									{#each item.options as opt, optIdx (optIdx)}
										{@const isUserChoice = item.selectedIndex === optIdx}
										{@const isCorrectAnswer = item.correctIndex === optIdx}
										<div
											class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs {isCorrectAnswer
												? 'border border-emerald-500/40 bg-emerald-500/15 font-bold text-emerald-400'
												: isUserChoice && !isCorrect
													? 'border border-danger/40 bg-danger/15 font-bold text-danger'
													: 'text-text-muted'}"
										>
											<span
												class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold {isCorrectAnswer
													? 'bg-emerald-500 text-slate-950'
													: isUserChoice && !isCorrect
														? 'bg-danger text-white'
														: 'bg-surface-muted text-text-muted'}"
											>
												{getOptionLabel(optIdx)}
											</span>
											<span>{opt}</span>
											{#if isCorrectAnswer}
												<span class="ml-auto text-[10px] font-bold text-emerald-400"
													>✓ Correct Key</span
												>
											{:else if isUserChoice}
												<span class="ml-auto text-[10px] font-bold text-danger">✕ Your Answer</span>
											{/if}
										</div>
									{/each}
								</div>

								<!-- Explanation -->
								{#if item.explanation}
									<div class="mt-1 pl-7 text-[11px] leading-relaxed text-text-muted">
										<strong class="text-text">Explanation:</strong>
										{item.explanation}
									</div>
								{/if}

								<!-- AI Tutor Help for Incorrect Answers -->
								{#if !isCorrect}
									<div class="pt-1 pl-7">
										{#if reviewingItemIndex !== idx}
											<button
												type="button"
												onclick={() => handleRequestExplanation(item, idx)}
												class="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary-soft px-3 py-1 text-[11px] font-bold text-primary transition-all hover:bg-primary hover:text-white"
											>
												<span>🤖 Explain My Mistake</span>
											</button>
										{:else}
											<div
												class="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-3 text-xs"
											>
												<div class="flex items-center gap-1.5 text-[11px] font-bold text-primary">
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
						{/each}
					</div>
				</div>
			{/if}

			<!-- Community Questions (approved only, sourced from peer-questions GET) -->
			<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="text-base">🌐</span>
						<h3 class="font-display text-sm font-bold text-text">Community Practice Questions</h3>
					</div>
					{#if loadingCommunityQs}
						<span
							class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
						></span>
					{/if}
				</div>

				{#if !loadingCommunityQs && communityQuestions.length === 0}
					<p class="text-xs text-text-muted">
						No approved community questions yet for this course. Be the first to contribute one
						below!
					</p>
				{:else if communityQuestions.length > 0}
					<div class="flex flex-col gap-3">
						{#each communityQuestions as cq (cq.id)}
							<div
								class="flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface-muted/40 p-4"
							>
								<p class="text-xs font-semibold text-text">{cq.question}</p>
								<ul class="flex flex-col gap-1.5">
									{#each cq.options as opt, oi (oi)}
										<li
											class="flex items-center gap-2 text-xs {oi === cq.correctAnswer
												? 'font-bold text-emerald-400'
												: 'text-text-muted'}"
										>
											<span
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold {oi ===
												cq.correctAnswer
													? 'bg-emerald-500 text-slate-950'
													: 'bg-surface-muted text-text-muted'}">{getOptionLabel(oi)}</span
											>
											{opt}{oi === cq.correctAnswer ? ' ✓' : ''}
										</li>
									{/each}
								</ul>
								{#if cq.explanation}
									<p class="mt-1 text-[11px] leading-relaxed text-text-muted">
										<strong class="text-text">Note:</strong>
										{cq.explanation}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Collapsible Suggest-a-Question Form -->
				<div class="border-t border-border/60 pt-2">
					<button
						type="button"
						id="toggle-suggest-form-btn"
						onclick={() => (showSuggestForm = !showSuggestForm)}
						aria-expanded={showSuggestForm}
						aria-controls="suggest-question-form-container"
						class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-primary hover:underline"
					>
						<span aria-hidden="true">{showSuggestForm ? '▾' : '▸'}</span> 💡 Suggest a question for this
						topic
					</button>

					{#if showSuggestForm}
						<div id="suggest-question-form-container" class="mt-3 flex flex-col gap-3">
							<div>
								<label
									for="suggest-question-input"
									class="mb-1 block text-[11px] font-bold text-text-muted uppercase">Question</label
								>
								<textarea
									id="suggest-question-input"
									bind:value={suggestQuestion}
									rows="2"
									placeholder="Write a multiple-choice question about this topic..."
									class="w-full rounded-xl border border-border bg-surface-muted p-2.5 text-xs text-text focus:border-primary focus:outline-none"
								></textarea>
							</div>

							<div class="flex flex-col gap-2">
								<span class="text-[11px] font-bold text-text-muted uppercase"
									>Answer Options (mark the correct one)</span
								>
								{#each [0, 1, 2, 3] as oi (oi)}
									<div class="flex items-center gap-2">
										<input
											type="radio"
											name="suggest-correct"
											id="suggest-correct-{oi}"
											aria-label="Mark option {getOptionLabel(oi)} as correct answer"
											value={oi}
											bind:group={suggestCorrect}
											class="cursor-pointer accent-primary"
										/>
										<input
											type="text"
											bind:value={suggestOptions[oi]}
											aria-label="Option {getOptionLabel(oi)} text"
											placeholder="Option {getOptionLabel(oi)}"
											class="grow rounded-lg border border-border bg-surface-muted p-2 text-xs text-text focus:border-primary focus:outline-none"
										/>
									</div>
								{/each}
								<p class="text-[10px] text-text-muted">
									Select the radio button next to the correct answer.
								</p>
							</div>

							<div>
								<label
									for="suggest-explanation-input"
									class="mb-1 block text-[11px] font-bold text-text-muted uppercase"
									>Explanation (optional)</label
								>
								<input
									id="suggest-explanation-input"
									type="text"
									bind:value={suggestExplanation}
									placeholder="Brief explanation of why the answer is correct..."
									class="w-full rounded-xl border border-border bg-surface-muted p-2.5 text-xs text-text focus:border-primary focus:outline-none"
								/>
							</div>

							<button
								type="button"
								id="submit-peer-question-btn"
								onclick={handleSubmitSuggestion}
								disabled={submittingSuggestion}
								class="cursor-pointer self-end rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 disabled:opacity-50"
							>
								{submittingSuggestion ? 'Submitting...' : 'Submit for Review'}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<!-- Top Bar with Progress -->
		<div class="flex flex-col gap-2.5 border-b border-border pb-3.5">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2.5">
					<span class="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
						Question {activeQuestionIndex + 1} of {questions.length}
					</span>
					<span class="text-xs font-semibold text-text-muted">
						Answered: {answeredCount}/{questions.length}
					</span>
				</div>

				<div class="flex items-center gap-2">
					{#if onFlagContent}
						<button
							type="button"
							onclick={onFlagContent}
							aria-label="Report issue with this quiz question"
							class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-danger hover:text-danger active:scale-95"
							title="Report issue with this quiz"
						>
							<span aria-hidden="true">🚩</span>
							<span>Report</span>
						</button>
					{/if}

					{#if onRegenerateQuestion}
						<button
							type="button"
							onclick={onRegenerateQuestion}
							disabled={isRegenerating}
							aria-label="Regenerate this specific question with AI"
							class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft/50 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-white disabled:opacity-50"
							title="Regenerate this specific question with AI"
						>
							{#if isRegenerating}
								<span
									class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
									aria-hidden="true"
								></span>
								<span>Regenerating...</span>
							{:else}
								<span aria-hidden="true">✨</span>
								<span>Regenerate Question</span>
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<!-- Question Index Pills Navigator -->
			<div class="flex items-center gap-1.5 overflow-x-auto py-1">
				{#each questions as question, qIdx (question.prompt || qIdx)}
					{@const isAnswered = userAnswers[qIdx] !== null}
					{@const isActive = activeQuestionIndex === qIdx}
					<button
						type="button"
						onclick={() => (activeQuestionIndex = qIdx)}
						aria-label={`Go to question ${qIdx + 1}${isAnswered ? ' (Answered)' : ''}`}
						class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-all {isActive
							? 'bg-primary text-white shadow-xs ring-2 ring-primary/40'
							: isAnswered
								? 'bg-primary-soft text-primary hover:bg-primary/20'
								: 'bg-surface-muted text-text-muted hover:bg-surface-muted/80'}"
					>
						{qIdx + 1}
					</button>
				{/each}
			</div>

			<!-- Animated Progress Bar -->
			<div
				class="h-1.5 w-full overflow-hidden rounded-full bg-border/60"
				role="progressbar"
				aria-valuenow={answeredCount}
				aria-valuemin={0}
				aria-valuemax={questions.length}
				aria-label={`Quiz progress: ${answeredCount} of ${questions.length} questions answered`}
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
				<h3 id="quiz-question-heading" class="font-display text-lg font-bold text-text sm:text-xl">
					{questionPrompt}
				</h3>

				<!-- Option List -->
				<div class="flex flex-col gap-3" role="radiogroup" aria-labelledby="quiz-question-heading">
					{#each activeQuestion.options as option, idx (idx)}
						{@const isSelected = selectedOptionIndex === idx}

						<button
							type="button"
							role="radio"
							aria-checked={isSelected}
							aria-label={`Option ${getOptionLabel(idx)}: ${option}`}
							onclick={() => handleSelectOption(idx)}
							class="flex w-full cursor-pointer items-center justify-between rounded-2xl border p-4 text-left text-xs font-medium transition-all duration-180 sm:text-sm
						{isSelected
								? 'border-primary bg-primary-soft font-bold text-primary ring-2 ring-primary/40'
								: 'border-border bg-surface text-text hover:border-text-muted hover:bg-surface-muted/60'}"
						>
							<div class="flex items-center gap-3">
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold
								{isSelected ? 'bg-primary text-white' : 'bg-surface-muted text-text-muted'}"
									aria-hidden="true"
								>
									{getOptionLabel(idx)}
								</span>
								<span>{option}</span>
							</div>

							{#if isSelected}
								<span class="text-xs font-bold text-primary">Selected</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Bottom Navigation & Action Bar -->
		<div class="flex items-center justify-between pt-2">
			<div class="flex items-center gap-2">
				{#if activeQuestionIndex > 0}
					<button
						type="button"
						onclick={handlePrevQuestion}
						class="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text transition-all hover:bg-surface-muted"
					>
						<span>&larr; Previous</span>
					</button>
				{/if}
				<span class="hidden text-[11px] font-semibold text-text-muted sm:inline">
					Keys: [1-4] select, [Arrows] navigate, [Enter] proceed
				</span>
			</div>

			<div class="flex items-center gap-2">
				{#if activeQuestionIndex < questions.length - 1}
					<button
						type="button"
						onclick={handleNextQuestion}
						class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-primary/20 shadow-md transition-all hover:bg-primary-hover active:scale-95"
					>
						<span>Next Question &rarr;</span>
					</button>
				{:else}
					<button
						type="button"
						onclick={handleSubmitQuiz}
						disabled={!isAllAnswered || isSubmittingQuiz}
						class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isSubmittingQuiz}
							<span
								class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							<span>Grading Answers...</span>
						{:else}
							<span>Submit & Grade Quiz 🏁</span>
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
