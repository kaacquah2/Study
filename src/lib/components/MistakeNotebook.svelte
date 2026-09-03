<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { apiFetch } from '$lib/api/client';
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
			const query = new SvelteURLSearchParams();
			if (moduleId) query.set('moduleId', moduleId);
			if (selectedFilter !== 'all') {
				query.set('resolved', selectedFilter === 'resolved' ? 'true' : 'false');
			}
			const endpoint = `/api/analytics/mistakes${query.toString() ? `?${query.toString()}` : ''}`;

			const { data } = await apiFetch<{ mistakes?: MistakeRecord[] }>(endpoint);
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
			await apiFetch('/api/analytics/mistakes', {
				method: 'PATCH',
				body: { questionId }
			});

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
			<h2 class="text-foreground flex items-center gap-2 text-xl font-bold tracking-tight">
				<AlertCircle class="h-5 w-5 text-amber-500" />
				Mistake Notebook & Error Bank
			</h2>
			<p class="text-muted-foreground mt-0.5 text-xs">
				Evidence-based error recovery: Review and practice previously missed quiz questions.
			</p>
		</div>

		<div class="flex items-center gap-2">
			{#if mistakes.length > 0 && !practiceMode}
				<button
					type="button"
					onclick={() => {
						practiceMode = true;
						activePracticeIndex = 0;
						userSelectedAnswer = null;
						isAnswerChecked = false;
					}}
					aria-label={`Practice my mistakes (${mistakes.filter((m) => !m.resolved).length} unresolved questions)`}
					class="text-primary-foreground flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:bg-primary/90"
				>
					<Sparkles class="h-3.5 w-3.5" aria-hidden="true" />
					Practice My Mistakes ({mistakes.filter((m) => !m.resolved).length})
				</button>
			{/if}

			<div
				class="bg-card flex rounded-lg border border-border p-0.5 text-xs"
				role="tablist"
				aria-label="Filter mistakes by resolution status"
			>
				<button
					type="button"
					role="tab"
					aria-selected={selectedFilter === 'unresolved'}
					onclick={() => {
						selectedFilter = 'unresolved';
						fetchMistakes();
					}}
					class="cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors {selectedFilter ===
					'unresolved'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Unresolved
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={selectedFilter === 'resolved'}
					onclick={() => {
						selectedFilter = 'resolved';
						fetchMistakes();
					}}
					class="cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors {selectedFilter ===
					'resolved'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Resolved
				</button>
			</div>
		</div>
	</div>

	{#if error}
		<div
			role="alert"
			aria-live="polite"
			class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400"
		>
			{error}
		</div>
	{/if}

	<!-- Practice Interactive Mode -->
	{#if practiceMode && activePracticeItem}
		<div
			class="bg-card rounded-xl border border-primary/30 p-6 shadow-lg"
			role="region"
			aria-label="Mistake Practice Mode"
		>
			<div class="flex items-center justify-between border-b border-border pb-3">
				<div class="flex items-center gap-2">
					<span class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
						Question {activePracticeIndex + 1} of {mistakes.length}
					</span>
					{#if activePracticeItem.conceptTag}
						<span class="text-muted-foreground text-xs">
							Topic: <strong>{activePracticeItem.conceptTag}</strong>
						</span>
					{/if}
				</div>
				<button
					type="button"
					onclick={() => (practiceMode = false)}
					aria-label="Exit practice mode"
					class="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium"
				>
					Exit Practice
				</button>
			</div>

			<div class="my-5">
				<h3 id="practice-question-prompt" class="text-foreground text-base font-semibold">
					{activePracticeItem.questionSnapshot.prompt}
				</h3>
			</div>

			<div
				class="flex flex-col gap-2.5"
				role="radiogroup"
				aria-labelledby="practice-question-prompt"
			>
				{#each activePracticeItem.questionSnapshot.options as option, idx (idx)}
					{@const isSelected = userSelectedAnswer === idx}
					{@const isCorrect = idx === activePracticeItem.questionSnapshot.correctIndex}
					<button
						type="button"
						role="radio"
						aria-checked={isSelected}
						aria-disabled={isAnswerChecked}
						disabled={isAnswerChecked}
						onclick={() => (userSelectedAnswer = idx)}
						class="flex cursor-pointer items-center justify-between rounded-lg border p-3 text-left text-sm transition-all duration-150 {isAnswerChecked
							? isCorrect
								? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
								: isSelected
									? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
									: 'text-muted-foreground border-border opacity-60'
							: isSelected
								? 'border-primary bg-primary/10 font-medium text-primary'
								: 'bg-card hover:bg-muted/40 text-foreground border-border hover:border-primary/40'}"
					>
						<span>{option}</span>
						{#if isAnswerChecked && isCorrect}
							<Check class="h-4 w-4 text-emerald-500" aria-label="Correct answer" />
						{/if}
					</button>
				{/each}
			</div>

			{#if isAnswerChecked}
				<div
					role="status"
					aria-live="polite"
					class="bg-muted/40 mt-5 rounded-lg border border-border p-4 text-xs"
				>
					<h4 class="text-foreground mb-1 font-semibold">Explanation:</h4>
					<p class="text-muted-foreground leading-relaxed">
						{activePracticeItem.questionSnapshot.explanation || 'No explanation provided.'}
					</p>
				</div>
			{/if}

			<div class="mt-6 flex justify-end gap-3">
				{#if !isAnswerChecked}
					<button
						type="button"
						disabled={userSelectedAnswer === null}
						onclick={checkPracticeAnswer}
						class="text-primary-foreground cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-semibold shadow-sm disabled:opacity-50"
					>
						Check Answer
					</button>
				{:else}
					<button
						type="button"
						onclick={nextPracticeItem}
						class="text-primary-foreground cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-semibold shadow-sm"
					>
						{activePracticeIndex < mistakes.length - 1 ? 'Next Question →' : 'Finish Practice'}
					</button>
				{/if}
			</div>
		</div>
	{:else if loading}
		<div class="flex flex-col gap-3">
			<div class="bg-muted/40 h-20 animate-pulse rounded-xl border border-border"></div>
			<div class="bg-muted/40 h-20 animate-pulse rounded-xl border border-border"></div>
		</div>
	{:else if mistakes.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center"
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"
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
		<div class="flex flex-col gap-3">
			{#each mistakes as mistake (mistake.questionId)}
				<div
					class="bg-card flex flex-col gap-2 rounded-xl border border-border p-4 transition-all hover:border-primary/40"
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<div class="mb-1 flex items-center gap-2">
								{#if mistake.resolved}
									<span
										class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
									>
										Resolved
									</span>
								{:else}
									<span
										class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
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
								type="button"
								onclick={() => handleResolve(mistake.questionId)}
								aria-label={`Mark mistake as resolved: ${mistake.questionSnapshot.prompt.slice(0, 40)}`}
								class="shrink-0 cursor-pointer text-xs font-medium text-primary hover:underline"
							>
								Mark Resolved
							</button>
						{/if}
					</div>

					<div
						class="bg-muted/40 text-muted-foreground mt-1 flex flex-col gap-1 rounded-lg p-3 text-xs"
					>
						<div>
							<span class="font-medium text-emerald-600 dark:text-emerald-400">Correct Answer:</span
							>
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
