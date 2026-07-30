<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, getDoc } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Course {
		title: string;
	}

	interface QuizQuestion {
		prompt: string;
		options: string[];
		correctIndex: number;
		explanation: string;
	}

	interface QuizModule {
		title: string;
		type: string;
		status: string;
		questions: QuizQuestion[];
	}

	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.mid);

	// States
	let course = $state<Course | null>(null);
	let moduleData = $state<QuizModule | null>(null);
	let currentQuestionIndex = $state(0);
	let selectedOptionIndex = $state<number | null>(null);
	let score = $state(0);
	let loading = $state(true);
	let loadError = $state('');

	// Derive questions
	let questions = $derived(moduleData?.questions || []);
	let totalQuestions = $derived(questions.length);
	let currentQuestion = $derived(questions[currentQuestionIndex] || null);

	// Load Data
	$effect(() => {
		if (authStore.user && courseId && moduleId) {
			loadData();
		}
	});

	const loadData = async () => {
		const cId = courseId as string;
		const mId = moduleId as string;
		loading = true;
		loadError = '';

		try {
			const courseDoc = await getDoc(doc(db, 'courses', cId));
			if (courseDoc.exists()) {
				course = courseDoc.data() as Course;
			} else {
				loadError = 'The requested course could not be found.';
				loading = false;
				return;
			}

			const moduleDoc = await getDoc(doc(db, `courses/${cId}/modules`, mId));
			if (moduleDoc.exists()) {
				moduleData = moduleDoc.data() as QuizModule;
				if (moduleData.type !== 'quiz' || moduleData.status !== 'ready') {
					// If not a ready quiz, redirect to course view
					goto(resolve(`/courses/${cId}`));
					return;
				}
			} else {
				loadError = 'The requested quiz could not be found.';
				loading = false;
				return;
			}
			loading = false;
		} catch (e) {
			console.error('Error loading quiz page data:', e);
			loadError = 'Failed to load quiz content. Please check your network connection.';
			loading = false;
		}
	};

	// Option selection
	const handleSelectOption = (index: number) => {
		if (selectedOptionIndex !== null || loading) return; // options locked
		selectedOptionIndex = index;

		if (index === currentQuestion.correctIndex) {
			score += 1;
		}
	};

	// Next question / complete quiz
	const handleNext = async () => {
		if (currentQuestionIndex < totalQuestions - 1) {
			currentQuestionIndex += 1;
			selectedOptionIndex = null; // reset lock
		} else {
			await completeQuiz();
		}
	};

	// Submit quiz completed
	const completeQuiz = async () => {
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
					score,
					total: totalQuestions,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
				})
			});

			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error?.message || 'Failed to complete quiz');
			}

			const currentStreak = result.streak.current;
			const extended = result.streak.extended;

			goto(
				resolve(
					`/courses/${courseId}/complete?type=quiz&streak=${currentStreak}&extended=${extended}&score=${score}&total=${totalQuestions}`
				)
			);
		} catch (e) {
			console.error(e);
			alert('Failed to submit quiz scores. Please check your network connection.');
			loading = false;
		}
	};
</script>

<svelte:head>
	<title>{moduleData ? moduleData.title : 'Quiz'} &mdash; AI Study Buddy</title>
</svelte:head>

<AppShell requireAuth={true}>
	<div class="mx-auto flex w-full max-w-3xl grow flex-col gap-6 px-6 py-8">
		<!-- Header Navigation Back Link -->
		<a
			href={resolve(`/courses/${courseId}`)}
			class="inline-flex items-center gap-1.5 rounded-md p-1.5 text-xs font-bold tracking-wider text-text-muted uppercase transition-all duration-180 select-none hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
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
			<div class="my-6 rounded-lg border border-border bg-surface p-10 text-center shadow-md">
				<div
					class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-danger-soft text-danger"
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
				<h3 class="mb-2 font-display text-xl font-bold text-text">Failed to load quiz</h3>
				<p class="mb-6 text-sm text-text-muted">
					{loadError}
				</p>
				<div class="flex justify-center gap-3">
					<a
						href={resolve(`/courses/${courseId}`)}
						class="rounded-r-md border border-border bg-surface px-6 py-3 text-xs font-bold text-text shadow-sm hover:bg-surface-muted"
					>
						Back to course
					</a>
					<button
						type="button"
						class="rounded-r-md bg-primary px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]"
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
				class="flex grow animate-pulse flex-col gap-5 rounded-lg border border-border bg-surface p-6 shadow-md sm:p-10"
			>
				<div class="mb-2 h-4 w-24 rounded bg-surface-muted"></div>
				<div class="mb-4 h-8 w-2/3 rounded bg-surface-muted"></div>
				{#each [0, 1, 2, 3] as idx (idx)}
					<div class="h-12 w-full rounded bg-surface-muted"></div>
				{/each}
			</div>
		{:else}
			<!-- Breadcrumb Header Row (Quiz variation, as specified in PDF Page 05) -->
			<div
				class="flex items-center justify-between rounded-lg border border-border bg-surface p-4 shadow-sm select-none"
			>
				<div class="flex items-center gap-4">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-course-amber-soft text-sm font-bold text-course-amber shadow-sm"
					>
						Q
					</div>
					<div>
						<span
							class="mb-0.5 block text-[9px] font-bold tracking-widest text-text-muted uppercase"
						>
							{course ? course.title : 'Course'}
						</span>
						<h2 class="font-display text-base leading-tight font-bold text-text">
							{moduleData.title}
						</h2>
					</div>
				</div>

				<!-- Live Score Counter -->
				<span
					class="rounded border border-border bg-surface-muted px-3 py-1.5 text-xs font-bold text-text"
				>
					Score {score} / {totalQuestions}
				</span>
			</div>

			<!-- Quiz Card -->
			<div
				class="flex min-h-[380px] grow flex-col justify-between rounded-lg border border-border bg-surface p-6 shadow-md sm:p-10"
			>
				<div>
					<!-- Question Caption -->
					<div
						class="mb-6 text-[10px] font-bold tracking-widest text-text-muted uppercase select-none"
					>
						Question {currentQuestionIndex + 1} of {totalQuestions}
					</div>

					<!-- Question Prompt -->
					<h3 class="mb-6 font-display text-lg leading-snug font-bold text-text sm:text-xl">
						{currentQuestion.prompt}
					</h3>

					<!-- Option Choices List -->
					<div class="flex flex-col gap-3">
						{#each currentQuestion.options as option, idx (idx)}
							{@const isSelected = selectedOptionIndex === idx}
							{@const isCorrectOption = currentQuestion.correctIndex === idx}
							{@const isRevealed = selectedOptionIndex !== null}

							<!-- Visual Styling variables based on correctness state -->
							{@const optionBgClass = !isRevealed
								? 'bg-surface hover:bg-surface-muted border-border'
								: isSelected && isCorrectOption
									? 'bg-success-soft border-success text-success'
									: isSelected && !isCorrectOption
										? 'bg-danger-soft border-danger text-danger'
										: isCorrectOption
											? 'bg-success-soft border-success text-success'
											: 'bg-surface-muted border-border/50 opacity-60'}

							<button
								type="button"
								class="flex w-full items-center justify-between rounded-r-md border p-4 text-left transition-all duration-180 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary {optionBgClass} {selectedOptionIndex ===
								null
									? 'cursor-pointer active:scale-[0.99]'
									: 'cursor-default'}"
								onclick={() => handleSelectOption(idx)}
								disabled={selectedOptionIndex !== null}
							>
								<div class="flex items-center gap-3.5 pr-4">
									<!-- Letter box (A, B, C, D) -->
									<div
										class="flex h-7 w-7 items-center justify-center rounded text-xs font-bold shadow-inner select-none
                    {!isRevealed
											? 'border border-border bg-surface-muted text-text-muted'
											: isSelected && isCorrectOption
												? 'bg-success text-white'
												: isSelected && !isCorrectOption
													? 'bg-danger text-white'
													: isCorrectOption
														? 'bg-success text-white'
														: 'bg-surface-muted text-text-muted opacity-50'}"
									>
										{String.fromCharCode(65 + idx)}
									</div>
									<span class="text-sm leading-relaxed font-semibold">
										{option}
									</span>
								</div>

								<!-- Correct/Incorrect Checks -->
								{#if isRevealed}
									{#if isCorrectOption}
										<div
											class="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white shadow-sm"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="h-3 w-3"><polyline points="20 6 9 17 4 12" /></svg
											>
										</div>
									{:else if isSelected}
										<div
											class="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-sm"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="h-3 w-3"
												><line x1="18" y1="6" x2="6" y2="18" /><line
													x1="6"
													y1="6"
													x2="18"
													y2="18"
												/></svg
											>
										</div>
									{/if}
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Explanation & Actions block -->
				<div class="mt-8 flex flex-col gap-6">
					<!-- Explanation Panel (slides in when revealed) -->
					{#if selectedOptionIndex !== null}
						<div
							class="animate-slide-down rounded-r-md border-l-4 border-primary bg-surface-muted p-4 text-xs leading-relaxed"
						>
							<span class="mb-1 block font-bold tracking-wider text-text uppercase"
								>Explanation</span
							>
							<p class="leading-relaxed text-text-muted">
								{currentQuestion.explanation}
							</p>
						</div>
					{/if}

					<!-- Footer Action Button -->
					<div class="flex justify-end border-t border-border pt-6 select-none">
						{#if selectedOptionIndex !== null}
							<button
								type="button"
								class="animate-fade-in cursor-pointer rounded-r-md bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
								onclick={handleNext}
								disabled={loading}
							>
								{#if currentQuestionIndex === totalQuestions - 1}
									Finish quiz
								{:else}
									Next question
								{/if}
							</button>
						{:else}
							<div class="py-2.5 text-xs font-semibold text-text-muted italic select-none">
								Select an option to locked your answer and view explanation.
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</AppShell>

<style>
	.animate-slide-down {
		animation: slideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	.animate-fade-in {
		animation: fadeIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
