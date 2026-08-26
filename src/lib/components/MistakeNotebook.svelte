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

<div class="flex flex-col gap-6">
	<!-- Header / Controls -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-amber-500" />
				Mistake Notebook & Error Bank
			</h2>
			<p class="text-xs text-muted-foreground mt-0.5">
				Evidence-based error recovery: Review and practice previously missed quiz questions.
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if mistakes.length > 0 && !practiceMode}
				<button
					onclick={() => {
						practiceMode = true;
						activePracticeIndex = 0;
						userSelectedAnswer = null;
						isAnswerChecked = false;
					}}
					class="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
				>
					<Sparkles class="h-3.5 w-3.5" />
					Practice My Mistakes ({mistakes.filter((m) => !m.resolved).length})
				</button>
			{/if}

			<div class="flex rounded-lg border border-border bg-card p-0.5 text-xs">
				<button
					onclick={() => {
						selectedFilter = 'unresolved';
						fetchMistakes();
					}}
					class="rounded-md px-2.5 py-1 font-medium transition-colors {selectedFilter === 'unresolved'
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
					class="rounded-md px-2.5 py-1 font-medium transition-colors {selectedFilter === 'resolved'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Resolved
				</button>
			</div>
		</div>
	</div>

	{#if error}
		<div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
			{error}
		</div>
	{/if}

	<!-- Practice Interactive Mode -->
	{#if practiceMode && activePracticeItem}
		<div class="rounded-xl border border-primary/30 bg-card p-6 shadow-lg">
			<div class="flex items-center justify-between border-b border-border pb-3">
				<div class="flex items-center gap-2">
					<span class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
						Question {activePracticeIndex + 1} of {mistakes.length}
					</span>
					{#if activePracticeItem.conceptTag}
						<span class="text-xs text-muted-foreground">
							Topic: <strong>{activePracticeItem.conceptTag}</strong>
						</span>
					{/if}
				</div>
				<button
					onclick={() => (practiceMode = false)}
					class="text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					Exit Practice
				</button>
			</div>

			<div class="my-5">
				<p class="text-base font-semibold text-foreground">
					{activePracticeItem.questionSnapshot.prompt}
				</p>
			</div>

			<div class="flex flex-col gap-2.5">
				{#each activePracticeItem.questionSnapshot.options as option, idx (idx)}
					{@const isSelected = userSelectedAnswer === idx}
					{@const isCorrect = idx === activePracticeItem.questionSnapshot.correctIndex}
					<button
						disabled={isAnswerChecked}
						onclick={() => (userSelectedAnswer = idx)}
						class="flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-all duration-150 {isAnswerChecked
							? isCorrect
								? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium'
								: isSelected
									? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
									: 'border-border text-muted-foreground opacity-60'
							: isSelected
								? 'border-primary bg-primary/10 text-primary font-medium'
								: 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 text-foreground'}"
					>
						<span>{option}</span>
						{#if isAnswerChecked && isCorrect}
							<Check class="h-4 w-4 text-emerald-500" />
						{/if}
					</button>
				{/each}
			</div>

			{#if isAnswerChecked}
				<div class="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-xs">
					<h4 class="font-semibold text-foreground mb-1">Explanation:</h4>
					<p class="text-muted-foreground leading-relaxed">
						{activePracticeItem.questionSnapshot.explanation || 'No explanation provided.'}
					</p>
				</div>
			{/if}

			<div class="mt-6 flex justify-end gap-3">
				{#if !isAnswerChecked}
					<button
						disabled={userSelectedAnswer === null}
						onclick={checkPracticeAnswer}
						class="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
					>
						Check Answer
					</button>
				{:else}
					<button
						onclick={nextPracticeItem}
						class="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
					>
						{activePracticeIndex < mistakes.length - 1 ? 'Next Question →' : 'Finish Practice'}
					</button>
				{/if}
			</div>
		</div>
	{:else if loading}
		<div class="flex flex-col gap-3">
			<div class="h-20 animate-pulse rounded-xl border border-border bg-muted/40"></div>
			<div class="h-20 animate-pulse rounded-xl border border-border bg-muted/40"></div>
		</div>
	{:else if mistakes.length === 0}
		<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
				<CheckCircle2 class="h-6 w-6" />
			</div>
			<h3 class="mt-3 text-sm font-semibold text-foreground">No mistakes recorded!</h3>
			<p class="mt-1 text-xs text-muted-foreground max-w-sm">
				{selectedFilter === 'unresolved'
					? 'Great work! You have no unresolved quiz errors in your error bank.'
					: 'No resolved questions in history yet.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each mistakes as mistake (mistake.questionId)}
				<div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40">
					<div class="flex items-start justify-between gap-3">
						<div>
							<div class="flex items-center gap-2 mb-1">
								{#if mistake.resolved}
									<span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
										Resolved
									</span>
								{:else}
									<span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
										Missed {mistake.mistakeCount}x
									</span>
								{/if}
								{#if mistake.conceptTag}
									<span class="text-xs font-medium text-muted-foreground">
										• {mistake.conceptTag}
									</span>
								{/if}
							</div>
							<h4 class="text-sm font-semibold text-foreground">
								{mistake.questionSnapshot.prompt}
							</h4>
						</div>

						{#if !mistake.resolved}
							<button
								onclick={() => handleResolve(mistake.questionId)}
								class="shrink-0 text-xs font-medium text-primary hover:underline"
							>
								Mark Resolved
							</button>
						{/if}
					</div>

					<div class="mt-1 rounded-lg bg-muted/40 p-3 text-xs flex flex-col gap-1 text-muted-foreground">
						<div>
							<span class="font-medium text-emerald-600 dark:text-emerald-400">Correct Answer:</span>
							{mistake.questionSnapshot.options[mistake.questionSnapshot.correctIndex]}
						</div>
						{#if mistake.questionSnapshot.explanation}
							<div class="mt-1 border-t border-border/50 pt-1 text-[11px]">
								{mistake.questionSnapshot.explanation}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
