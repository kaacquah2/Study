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

	const fetchCommunityQuestions = async () => {
		if (!courseId) return;
		loadingCommunityQs = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(
				`/api/courses/peer-questions?courseId=${encodeURIComponent(courseId)}`,
				{
					headers: { Authorization: `Bearer ${idToken}` }
				}
			);
			if (res.ok) {
				const data = await res.json();
				communityQuestions = data.questions || [];
			}
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
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/courses/peer-questions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId,
					question: suggestQuestion.trim(),
					options: suggestOptions.map((o) => o.trim()).filter(Boolean),
					correctAnswer: suggestCorrect,
					explanation: suggestExplanation.trim()
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Submission failed');
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

	const handleFinishAndComplete = () => {
		onComplete(finalScore, finalReviewItems);
	};

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
		activeQuestion ? activeQuestion.prompt || activeQuestion.question || '' : ''
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
			summary: isCorrect
				? 'Answered correctly'
				: `Answered incorrectly (chose option ${selectedOptionIndex + 1})`
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
			// Show the in-runner completion screen with community questions
			finalScore = score;
			finalReviewItems = [...quizReviewItems];
			quizFinished = true;
			fetchCommunityQuestions();
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
			? Math.min(
					100,
					Math.round(((currentQuestionIndex + (isAnswerLocked ? 1 : 0)) / questions.length) * 100)
				)
			: 0
	);

	let questionsAnsweredCount = $derived(currentQuestionIndex + (isAnswerLocked ? 1 : 0));
</script>

<div class="gap-5 flex w-full flex-col">
	<!-- Quiz Finished: Score + Community Questions screen -->
	{#if quizFinished}
		<div class="gap-6 flex flex-col">
			<!-- Score Summary -->
			<div
				class="gap-4 rounded-3xl p-6 sm:p-8 flex flex-col items-center border border-border bg-surface text-center shadow-sm"
			>
				<span class="text-4xl"
					>{finalScore === questions.length
						? '🏆'
						: finalScore >= questions.length * 0.7
							? '🎉'
							: '📚'}</span
				>
				<div>
					<h2 class="font-display text-xl font-bold sm:text-2xl text-text">Quiz Complete!</h2>
					<p class="mt-1 text-sm text-text-muted">
						You scored <strong class="text-text">{finalScore}/{questions.length}</strong>
						({Math.round((finalScore / Math.max(questions.length, 1)) * 100)}% accuracy)
					</p>
				</div>
				<button
					type="button"
					id="quiz-continue-btn"
					onclick={handleFinishAndComplete}
					class="gap-2 rounded-2xl px-8 py-3.5 text-xs font-bold text-white inline-flex cursor-pointer items-center bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
				>
					Continue →
				</button>
			</div>

			<!-- Community Questions (approved only, sourced from peer-questions GET) -->
			<div class="gap-4 rounded-3xl p-6 flex flex-col border border-border bg-surface shadow-sm">
				<div class="flex items-center justify-between">
					<div class="gap-2 flex items-center">
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
					<div class="gap-3 flex flex-col">
						{#each communityQuestions as cq (cq.id)}
							<div
								class="gap-2 rounded-2xl p-4 flex flex-col border border-border/60 bg-surface-muted/40"
							>
								<p class="text-xs font-semibold text-text">{cq.question}</p>
								<ul class="gap-1.5 flex flex-col">
									{#each cq.options as opt, oi (oi)}
										<li
											class="gap-2 text-xs flex items-center {oi === cq.correctAnswer
												? 'font-bold text-emerald-400'
												: 'text-text-muted'}"
										>
											<span
												class="h-5 w-5 font-bold flex shrink-0 items-center justify-center rounded-md text-[10px] {oi ===
												cq.correctAnswer
													? 'bg-emerald-500 text-slate-950'
													: 'bg-surface-muted text-text-muted'}">{['A', 'B', 'C', 'D'][oi]}</span
											>
											{opt}{oi === cq.correctAnswer ? ' ✓' : ''}
										</li>
									{/each}
								</ul>
								{#if cq.explanation}
									<p class="mt-1 leading-relaxed text-[11px] text-text-muted">
										<strong class="text-text">Note:</strong>
										{cq.explanation}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Collapsible Suggest-a-Question Form -->
				<div class="pt-2 border-t border-border/60">
					<button
						type="button"
						id="toggle-suggest-form-btn"
						onclick={() => (showSuggestForm = !showSuggestForm)}
						aria-expanded={showSuggestForm}
						aria-controls="suggest-question-form-container"
						class="gap-1.5 text-xs font-bold inline-flex items-center text-primary hover:underline"
					>
						<span aria-hidden="true">{showSuggestForm ? '▾' : '▸'}</span> 💡 Suggest a question for this
						topic
					</button>

					{#if showSuggestForm}
						<div id="suggest-question-form-container" class="gap-3 mt-3 flex flex-col">
							<div>
								<label
									for="suggest-question-input"
									class="mb-1 font-bold block text-[11px] text-text-muted uppercase">Question</label
								>
								<textarea
									id="suggest-question-input"
									bind:value={suggestQuestion}
									rows="2"
									placeholder="Write a multiple-choice question about this topic..."
									class="p-2.5 text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
								></textarea>
							</div>

							<div class="gap-2 flex flex-col">
								<span class="font-bold text-[11px] text-text-muted uppercase"
									>Answer Options (mark the correct one)</span
								>
								{#each [0, 1, 2, 3] as oi (oi)}
									<div class="gap-2 flex items-center">
										<input
											type="radio"
											name="suggest-correct"
											id="suggest-correct-{oi}"
											aria-label="Mark option {['A', 'B', 'C', 'D'][oi]} as correct answer"
											value={oi}
											bind:group={suggestCorrect}
											class="cursor-pointer accent-primary"
										/>
										<input
											type="text"
											bind:value={suggestOptions[oi]}
											aria-label="Option {['A', 'B', 'C', 'D'][oi]} text"
											placeholder="Option {['A', 'B', 'C', 'D'][oi]}"
											class="p-2 text-xs grow rounded-lg border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
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
									class="mb-1 font-bold block text-[11px] text-text-muted uppercase"
									>Explanation (optional)</label
								>
								<input
									id="suggest-explanation-input"
									type="text"
									bind:value={suggestExplanation}
									placeholder="Brief explanation of why the answer is correct..."
									class="p-2.5 text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
								/>
							</div>

							<button
								type="button"
								id="submit-peer-question-btn"
								onclick={handleSubmitSuggestion}
								disabled={submittingSuggestion}
								class="px-5 py-2.5 text-xs font-bold text-white cursor-pointer self-end rounded-xl bg-primary shadow-sm hover:bg-primary-hover active:scale-95 disabled:opacity-50"
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
		<div class="gap-2.5 pb-3.5 flex flex-col border-b border-border">
			<div class="flex items-center justify-between">
				<div class="gap-2.5 flex items-center">
					<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary-soft text-primary">
						Question {currentQuestionIndex + 1} of {questions.length}
					</span>
					<span class="text-xs font-semibold text-text-muted">
						Score: {score}/{questions.length}
						{#if questionsAnsweredCount > 0}
							<span class="text-text-muted/60"
								>({Math.round((score / questionsAnsweredCount) * 100)}% accuracy)</span
							>
						{/if}
					</span>
				</div>

				<div class="gap-2 flex items-center">
					{#if onFlagContent}
						<button
							type="button"
							onclick={onFlagContent}
							aria-label="Report issue with this quiz question"
							class="gap-1 px-2.5 py-1 font-semibold inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-[11px] text-text-muted hover:border-danger hover:text-danger active:scale-95"
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
							class="gap-1.5 px-3 py-1.5 text-xs font-bold hover:text-white inline-flex cursor-pointer items-center rounded-xl border border-primary/40 bg-primary-soft/50 text-primary hover:bg-primary disabled:opacity-50"
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

			<!-- Animated Progress Bar -->
			<div
				class="h-1.5 w-full overflow-hidden rounded-full bg-border/60"
				role="progressbar"
				aria-valuenow={currentQuestionIndex + 1}
				aria-valuemin={1}
				aria-valuemax={questions.length}
				aria-label={`Quiz progress: question ${currentQuestionIndex + 1} of ${questions.length}`}
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
				class="gap-6 rounded-3xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
			>
				<h3 id="quiz-question-heading" class="font-display text-lg font-bold sm:text-xl text-text">
					{questionPrompt}
				</h3>

				<!-- Option List -->
				<div class="gap-3 flex flex-col" role="radiogroup" aria-labelledby="quiz-question-heading">
					{#each activeQuestion.options as option, idx (idx)}
						{@const isSelected = selectedOptionIndex === idx}
						{@const isCorrectOption = isAnswerLocked && idx === correctIndex}
						{@const isWrongSelection = isAnswerLocked && isSelected && idx !== correctIndex}

						<button
							type="button"
							role="radio"
							aria-checked={isSelected}
							aria-disabled={isAnswerLocked}
							aria-label={`Option ${['A', 'B', 'C', 'D'][idx]}: ${option}${isCorrectOption ? ' (Correct answer)' : isWrongSelection ? ' (Incorrect selection)' : ''}`}
							onclick={() => handleSelectOption(idx)}
							disabled={isAnswerLocked}
							class="rounded-2xl p-4 text-xs font-medium sm:text-sm flex w-full cursor-pointer items-center justify-between border text-left transition-all duration-180
						{isCorrectOption
								? 'border-emerald-500 bg-emerald-500/10 font-bold text-emerald-400 shadow-xs'
								: isWrongSelection
									? 'anim-shake font-bold border-danger bg-danger/10 text-danger'
									: isSelected
										? 'font-bold border-primary bg-primary-soft text-primary ring-2 ring-primary/40'
										: 'border-border bg-surface text-text hover:border-text-muted hover:bg-surface-muted/60'}"
						>
							<div class="gap-3 flex items-center">
								<span
									class="h-6 w-6 text-xs font-bold flex shrink-0 items-center justify-center rounded-lg
								{isCorrectOption
										? 'bg-emerald-500 text-slate-950'
										: isWrongSelection
											? 'text-white bg-danger'
											: isSelected
												? 'text-white bg-primary'
												: 'bg-surface-muted text-text-muted'}"
									aria-hidden="true"
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
					<div
						role="status"
						aria-live="polite"
						class="gap-3 rounded-2xl p-4 flex flex-col border border-border/80 bg-surface-muted/60"
					>
						{#if selectedOptionIndex === correctIndex}
							<div class="gap-2 text-xs font-bold text-emerald-400 flex items-center">
								<span>🎉 Great job! That's correct.</span>
							</div>
						{:else}
							<div class="gap-2 flex items-center justify-between">
								<span class="text-xs font-bold text-danger"
									>Incorrect. The correct answer was option {['A', 'B', 'C', 'D'][
										correctIndex
									]}.</span
								>
								{#if !aiExplanation && !isExplaining}
									<button
										type="button"
										onclick={handleRequestExplanation}
										aria-label="Explain why this answer was incorrect using AI Tutor"
										class="px-2.5 py-1 text-xs font-bold hover:text-white cursor-pointer rounded-lg bg-primary-soft text-primary hover:bg-primary"
									>
										🤖 Explain My Mistake
									</button>
								{/if}
							</div>
						{/if}

						<!-- Explanation Text -->
						{#if activeQuestion.explanation && !aiExplanation}
							<p class="text-xs leading-relaxed text-text-muted">
								<strong class="text-text">Explanation:</strong>
								{activeQuestion.explanation}
							</p>
						{/if}

						<!-- Streaming AI Explanation -->
						{#if isExplaining || aiExplanation}
							<div
								class="mt-2 p-3.5 text-xs rounded-xl border border-primary/30 bg-primary-soft/30"
								role="region"
								aria-label="AI Tutor Explanation"
							>
								<div class="mb-1.5 gap-2 font-bold flex items-center text-primary">
									<span>🤖 AI Tutor Reasoning:</span>
									{#if isExplaining}
										<span
											class="h-2 w-2 animate-ping rounded-full bg-primary"
											aria-label="Streaming explanation..."
										></span>
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
		<div class="pt-2 flex items-center justify-between">
			<span class="font-semibold text-[11px] text-text-muted">
				Keyboard: Keys [1-4] to select, [Enter] to submit
			</span>

			{#if !isAnswerLocked}
				<button
					type="button"
					onclick={handleConfirmAnswer}
					disabled={selectedOptionIndex === null}
					class="gap-2 rounded-2xl px-6 py-3 text-xs font-bold text-white inline-flex cursor-pointer items-center bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<span>Confirm Answer &rarr;</span>
				</button>
			{:else}
				<button
					type="button"
					onclick={handleNextQuestion}
					class="gap-2 rounded-2xl px-6 py-3 text-xs font-bold text-white inline-flex cursor-pointer items-center bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
				>
					<span
						>{currentQuestionIndex < questions.length - 1
							? 'Next Question &rarr;'
							: 'Finish Quiz 🏁'}</span
					>
				</button>
			{/if}
		</div>
	{/if}
</div>
