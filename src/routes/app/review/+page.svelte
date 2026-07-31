<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	interface DueQuestion {
		courseId: string;
		courseTitle: string;
		moduleId: string;
		moduleTitle: string;
		questionIndex: number;
		question: string;
		options: string[];
		answerIndex: number;
		explanation?: string;
		nextReviewDate?: string;
		intervalDays?: number;
	}

	let dueQuestions = $state<DueQuestion[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');
	let currentIndex = $state(0);
	let selectedOption = $state<number | null>(null);
	let isAnswered = $state(false);
	let reviewCount = $state(0);

	let currentQ = $derived(dueQuestions[currentIndex] || null);

	async function getToken(): Promise<string> {
		const token = await auth.currentUser?.getIdToken();
		if (!token) throw new Error('Not authenticated');
		return token;
	}

	async function fetchDueReviews() {
		loading = true;
		errorMsg = '';
		try {
			const token = await getToken();
			const res = await fetch('/api/spaced-repetition/due', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to load due review questions');
			const data = await res.json();
			dueQuestions = data.dueQuestions || [];
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Error loading reviews';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchDueReviews();
	});

	function handleSelectOption(index: number) {
		if (isAnswered) return;
		selectedOption = index;
		isAnswered = true;
	}

	async function submitRating(quality: number) {
		if (!currentQ) return;
		try {
			const token = await getToken();
			const res = await fetch('/api/spaced-repetition/review', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId: currentQ.courseId,
					moduleId: currentQ.moduleId,
					questionIndex: currentQ.questionIndex,
					quality
				})
			});
			if (res.ok) {
				reviewCount += 1;
				toastStore.success('Memory rating saved! FSRS scheduled next review.');
				advanceNext();
			} else {
				toastStore.error('Failed to submit review score.');
			}
		} catch {
			toastStore.error('Network error saving review score.');
		}
	}

	function advanceNext() {
		selectedOption = null;
		isAnswered = false;
		if (currentIndex < dueQuestions.length - 1) {
			currentIndex += 1;
		} else {
			dueQuestions = [];
		}
	}
</script>

<svelte:head>
	<title>Spaced Repetition Review &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border pb-4">
		<div>
			<a
				href={resolve('/app')}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold tracking-tight text-text">
				🧠 Spaced Repetition Drill (FSRS-4.5)
			</h1>
			<p class="text-xs text-text-muted">
				Strengthen long-term memory recall by reviewing cards scheduled for today.
			</p>
		</div>

		{#if dueQuestions.length > 0}
			<span class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400">
				{currentIndex + 1} of {dueQuestions.length} due
			</span>
		{/if}
	</div>

	{#if loading}
		<div class="flex flex-col gap-4">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{errorMsg}
		</div>
	{:else if dueQuestions.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-3xl"
			>
				🎉
			</div>
			<div>
				<h2 class="font-display text-xl font-bold text-text">All Due Reviews Completed!</h2>
				<p class="mt-1 max-w-md text-xs text-text-muted">
					Great job maintaining your memory retention! You have finished all spaced repetition cards
					due for today.
				</p>
			</div>
			{#if reviewCount > 0}
				<div
					class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400"
				>
					✓ Completed {reviewCount} card review{reviewCount > 1 ? 's' : ''} in this session
				</div>
			{/if}
			<a
				href={resolve('/app')}
				class="mt-2 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-95"
			>
				Return to Dashboard &rarr;
			</a>
		</div>
	{:else if currentQ}
		<div
			class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
		>
			<!-- Context Tag -->
			<div class="flex items-center justify-between">
				<span
					class="rounded-lg border border-primary/30 bg-primary-soft/60 px-3 py-1 text-[11px] font-bold text-primary"
				>
					📚 {currentQ.courseTitle} &bull; {currentQ.moduleTitle}
				</span>
				<span class="text-[11px] font-bold text-text-muted">
					Card {currentIndex + 1}/{dueQuestions.length}
				</span>
			</div>

			<!-- Question Prompt -->
			<h2 class="font-display text-lg leading-snug font-bold text-text sm:text-xl">
				{currentQ.question}
			</h2>

			<!-- MCQ Options -->
			<div class="flex flex-col gap-3">
				{#each currentQ.options as option, idx (idx)}
					{@const isCorrect = idx === currentQ.answerIndex}
					{@const isSelected = idx === selectedOption}
					<button
						type="button"
						onclick={() => handleSelectOption(idx)}
						disabled={isAnswered}
						class="flex w-full cursor-pointer items-center justify-between rounded-2xl border p-4 text-left text-xs font-semibold transition-all duration-180 {isAnswered
							? isCorrect
								? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
								: isSelected
									? 'border-danger/60 bg-danger-soft text-danger'
									: 'border-border/40 opacity-50'
							: 'border-border bg-surface hover:border-primary/50 hover:bg-surface-muted'}"
					>
						<span>{option}</span>
						{#if isAnswered}
							{#if isCorrect}
								<span class="text-sm font-bold text-emerald-400">✓ Correct</span>
							{:else if isSelected}
								<span class="text-sm font-bold text-danger">✕ Incorrect</span>
							{/if}
						{/if}
					</button>
				{/each}
			</div>

			<!-- Explanation & Rating Action (Post-answer) -->
			{#if isAnswered}
				<div class="flex flex-col gap-4 border-t border-border/60 pt-4">
					{#if currentQ.explanation}
						<div
							class="rounded-xl border border-border/60 bg-surface-muted/40 p-4 text-xs text-text-muted"
						>
							💡 <strong>Explanation:</strong>
							{currentQ.explanation}
						</div>
					{/if}

					<!-- FSRS Rating Buttons -->
					<div class="flex flex-col gap-2">
						<span class="text-center text-xs font-bold text-text-muted uppercase">
							Rate your recall difficulty (FSRS):
						</span>
						<div class="grid grid-cols-4 gap-2">
							<button
								type="button"
								onclick={() => submitRating(1)}
								class="cursor-pointer rounded-xl border border-rose-500/40 bg-rose-500/15 py-3 text-center text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/30 active:scale-95"
							>
								🔴 Forgot (Again)
							</button>
							<button
								type="button"
								onclick={() => submitRating(2)}
								class="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/15 py-3 text-center text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/30 active:scale-95"
							>
								🟠 Hard
							</button>
							<button
								type="button"
								onclick={() => submitRating(3)}
								class="cursor-pointer rounded-xl border border-blue-500/40 bg-blue-500/15 py-3 text-center text-xs font-bold text-blue-300 transition-all hover:bg-blue-500/30 active:scale-95"
							>
								🟢 Good
							</button>
							<button
								type="button"
								onclick={() => submitRating(5)}
								class="cursor-pointer rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-3 text-center text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/30 active:scale-95"
							>
								⚡ Easy
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
