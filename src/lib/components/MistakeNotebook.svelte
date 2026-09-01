<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { AlertCircle, CheckCircle2, Sparkles, Check } from '@lucide/svelte';
	import type { MistakeRecord } from '$lib/server/analytics/mistakeRecords';

	interface Props {
		moduleId?: string;
	}

	let { moduleId = '' }: Props = $props();

	let mistakes = $state<MistakeRecord[]>([]);
	let loading = $state(true);
	let error = $state('');
	let selectedFilter = $state<'all' | 'unresolved' | 'resolved'>('unresolved');
	let practiceMode = $state(false);
	let activePracticeIndex = $state(0);
	let userSelectedAnswer = $state<number | null>(null);
	let isAnswerChecked = $state(false);

	const fetchMistakes = async () => {
		loading = true;
		error = '';
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const url = new URL('/api/analytics/mistakes', window.location.origin);
			if (moduleId) url.searchParams.set('moduleId', moduleId);
			if (selectedFilter !== 'all') {
				url.searchParams.set('resolved', selectedFilter === 'resolved' ? 'true' : 'false');
			}

			const res = await fetch(url.toString(), {
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			if (!res.ok) throw new Error('Failed to load mistakes');
			const data = await res.json();
			mistakes = data.mistakes || [];
		} catch (e: unknown) {
			const err = e as Error;
			error = err.message || 'Failed to load mistake notebook';
		} finally {
			loading = false;
		}
	};

	onMount(() => {
		fetchMistakes();
	});

	const handleResolve = async (questionId: string) => {
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/analytics/mistakes', {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ questionId })
			});

			if (!res.ok) throw new Error('Failed to mark mistake resolved');
			mistakes = mistakes.map((m) => (m.questionId === questionId ? { ...m, resolved: true } : m));
			toastStore.success('Question marked as mastered!');
		} catch {
			toastStore.error('Could not update mistake');
		}
	};

	let activePracticeItem = $derived(mistakes[activePracticeIndex] || null);

	const checkPracticeAnswer = async () => {
		if (userSelectedAnswer === null || !activePracticeItem) return;
		isAnswerChecked = true;
		const isCorrect = userSelectedAnswer === activePracticeItem.questionSnapshot.correctIndex;

		if (isCorrect) {
			toastStore.success('Correct! Resolving from mistake bank.');
			await handleResolve(activePracticeItem.questionId);
		} else {
			toastStore.error('Incorrect. Review the explanation below.');
		}
	};

	const nextPracticeItem = () => {
		userSelectedAnswer = null;
		isAnswerChecked = false;
		if (activePracticeIndex < mistakes.length - 1) {
			activePracticeIndex += 1;
		} else {
			practiceMode = false;
			activePracticeIndex = 0;
			fetchMistakes();
		}
	};
</script>

<div class="gap-6 flex flex-col">
	<!-- Header / Controls -->
	<div class="gap-3 sm:flex-row sm:items-center sm:justify-between flex flex-col">
		<div>
			<h2 class="text-foreground gap-2 text-xl font-bold tracking-tight flex items-center">
				<AlertCircle class="h-5 w-5 text-amber-500" />
				Mistake Notebook & Error Bank
			</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Evidence-based error recovery: Review and practice previously missed quiz questions.
			</p>
		</div>

		<div class="gap-2 flex items-center">
			{#if mistakes.length > 0 && !practiceMode}
				<button
					onclick={() => {
						practiceMode = true;
						activePracticeIndex = 0;
						userSelectedAnswer = null;
						isAnswerChecked = false;
					}}
					class="text-primary-foreground gap-1.5 px-3.5 py-1.5 text-xs font-semibold flex items-center rounded-lg bg-primary shadow-sm transition-all hover:bg-primary/90"
				>
					<Sparkles class="h-3.5 w-3.5" />
					Practice My Mistakes ({mistakes.filter((m) => !m.resolved).length})
				</button>
			{/if}

			<div class="bg-card p-0.5 text-xs flex rounded-lg border border-border">
				<button
					onclick={() => {
						selectedFilter = 'unresolved';
						fetchMistakes();
					}}
					class="px-2.5 py-1 font-medium rounded-md transition-colors {selectedFilter ===
					'unresolved'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Unresolved
				</button>
				<button
					onclick={() => {
						selectedFilter = 'resolved';
						fetchMistakes();
					}}
					class="px-2.5 py-1 font-medium rounded-md transition-colors {selectedFilter === 'resolved'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Resolved
				</button>
			</div>
		</div>
	</div>

	{#if error}
		<div class="border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 rounded-xl border">
			{error}
		</div>
	{/if}

	<!-- Practice Interactive Mode -->
	{#if practiceMode && activePracticeItem}
		<div class="bg-card p-6 rounded-xl border border-primary/30 shadow-lg">
			<div class="pb-3 flex items-center justify-between border-b border-border">
				<div class="gap-2 flex items-center">
					<span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary">
						Question {activePracticeIndex + 1} of {mistakes.length}
					</span>
					{#if activePracticeItem.conceptTag}
						<span class="text-muted-foreground text-xs">
							Topic: <strong>{activePracticeItem.conceptTag}</strong>
						</span>
					{/if}
				</div>
				<button
					onclick={() => (practiceMode = false)}
					class="text-muted-foreground hover:text-foreground text-xs font-medium"
				>
					Exit Practice
				</button>
			</div>

			<div class="my-5">
				<p class="text-foreground text-base font-semibold">
					{activePracticeItem.questionSnapshot.prompt}
				</p>
			</div>

			<div class="gap-2.5 flex flex-col">
				{#each activePracticeItem.questionSnapshot.options as option, idx (idx)}
					{@const isSelected = userSelectedAnswer === idx}
					{@const isCorrect = idx === activePracticeItem.questionSnapshot.correctIndex}
					<button
						disabled={isAnswerChecked}
						onclick={() => (userSelectedAnswer = idx)}
						class="p-3 text-sm flex items-center justify-between rounded-lg border text-left transition-all duration-150 {isAnswerChecked
							? isCorrect
								? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
								: isSelected
									? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
									: 'text-muted-foreground border-border opacity-60'
							: isSelected
								? 'font-medium border-primary bg-primary/10 text-primary'
								: 'bg-card hover:bg-muted/40 text-foreground border-border hover:border-primary/40'}"
					>
						<span>{option}</span>
						{#if isAnswerChecked && isCorrect}
							<Check class="h-4 w-4 text-emerald-500" />
						{/if}
					</button>
				{/each}
			</div>

			{#if isAnswerChecked}
				<div class="bg-muted/40 mt-5 p-4 text-xs rounded-lg border border-border">
					<h4 class="text-foreground mb-1 font-semibold">Explanation:</h4>
					<p class="text-muted-foreground leading-relaxed">
						{activePracticeItem.questionSnapshot.explanation || 'No explanation provided.'}
					</p>
				</div>
			{/if}

			<div class="mt-6 gap-3 flex justify-end">
				{#if !isAnswerChecked}
					<button
						disabled={userSelectedAnswer === null}
						onclick={checkPracticeAnswer}
						class="text-primary-foreground px-4 py-2 text-xs font-semibold rounded-lg bg-primary shadow-sm disabled:opacity-50"
					>
						Check Answer
					</button>
				{:else}
					<button
						onclick={nextPracticeItem}
						class="text-primary-foreground px-4 py-2 text-xs font-semibold rounded-lg bg-primary shadow-sm"
					>
						{activePracticeIndex < mistakes.length - 1 ? 'Next Question →' : 'Finish Practice'}
					</button>
				{/if}
			</div>
		</div>
	{:else if loading}
		<div class="gap-3 flex flex-col">
			<div class="bg-muted/40 h-20 animate-pulse rounded-xl border border-border"></div>
			<div class="bg-muted/40 h-20 animate-pulse rounded-xl border border-border"></div>
		</div>
	{:else if mistakes.length === 0}
		<div
			class="py-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-center"
		>
			<div
				class="h-12 w-12 bg-emerald-500/10 text-emerald-500 flex items-center justify-center rounded-full"
			>
				<CheckCircle2 class="h-6 w-6" />
			</div>
			<h3 class="text-foreground mt-3 text-sm font-semibold">No mistakes recorded!</h3>
			<p class="text-muted-foreground mt-1 max-w-sm text-xs">
				{selectedFilter === 'unresolved'
					? 'Great work! You have no unresolved quiz errors in your error bank.'
					: 'No resolved questions in history yet.'}
			</p>
		</div>
	{:else}
		<div class="gap-3 flex flex-col">
			{#each mistakes as mistake (mistake.questionId)}
				<div
					class="bg-card gap-2 p-4 flex flex-col rounded-xl border border-border transition-all hover:border-primary/40"
				>
					<div class="gap-3 flex items-start justify-between">
						<div>
							<div class="mb-1 gap-2 flex items-center">
								{#if mistake.resolved}
									<span
										class="bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400 rounded-full text-[10px]"
									>
										Resolved
									</span>
								{:else}
									<span
										class="bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400 rounded-full text-[10px]"
									>
										Missed {mistake.mistakeCount}x
									</span>
								{/if}
								{#if mistake.conceptTag}
									<span class="text-muted-foreground text-xs font-medium">
										• {mistake.conceptTag}
									</span>
								{/if}
							</div>
							<h4 class="text-foreground text-sm font-semibold">
								{mistake.questionSnapshot.prompt}
							</h4>
						</div>

						{#if !mistake.resolved}
							<button
								onclick={() => handleResolve(mistake.questionId)}
								class="text-xs font-medium shrink-0 text-primary hover:underline"
							>
								Mark Resolved
							</button>
						{/if}
					</div>

					<div
						class="bg-muted/40 text-muted-foreground mt-1 gap-1 p-3 text-xs flex flex-col rounded-lg"
					>
						<div>
							<span class="font-medium text-emerald-600 dark:text-emerald-400">Correct Answer:</span
							>
							{mistake.questionSnapshot.options[mistake.questionSnapshot.correctIndex]}
						</div>
						{#if mistake.questionSnapshot.explanation}
							<div class="mt-1 pt-1 border-t border-border/50 text-[11px]">
								{mistake.questionSnapshot.explanation}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
