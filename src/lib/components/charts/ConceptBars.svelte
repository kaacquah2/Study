<script lang="ts">
	import type { ConceptMasteryAggregate } from '$lib/server/analytics/profileAggregator';
	import { CheckCircle2, AlertTriangle, ArrowRight, Sparkles, Filter } from '@lucide/svelte';

	interface Props {
		concepts: Record<string, ConceptMasteryAggregate>;
	}

	let { concepts = {} }: Props = $props();

	let filterMode = $state<'all' | 'strengths' | 'weaknesses'>('all');
	let sortBy = $state<'accuracy_desc' | 'accuracy_asc' | 'attempts'>('attempts');
	let searchQuery = $state('');

	// Format concepts list
	let conceptList = $derived(Object.values(concepts));

	let strengthsCount = $derived(conceptList.filter((c) => c.accuracy >= 70).length);
	let weaknessesCount = $derived(conceptList.filter((c) => c.isWeak || c.accuracy < 70).length);

	// Filtered & sorted concepts
	let displayConcepts = $derived.by(() => {
		let list = [...conceptList];

		// Filter by mode
		if (filterMode === 'strengths') {
			list = list.filter((c) => c.accuracy >= 70);
		} else if (filterMode === 'weaknesses') {
			list = list.filter((c) => c.isWeak || c.accuracy < 70);
		}

		// Filter by search
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter((c) => (c.conceptTag || c.conceptId).toLowerCase().includes(q));
		}

		// Sort
		if (sortBy === 'accuracy_desc') {
			list.sort((a, b) => b.accuracy - a.accuracy);
		} else if (sortBy === 'accuracy_asc') {
			list.sort((a, b) => a.accuracy - b.accuracy);
		} else {
			list.sort((a, b) => b.totalAttempts - a.totalAttempts);
		}

		return list;
	});

	function getBarColor(acc: number, isWeak: boolean) {
		if (isWeak || acc < 50) return 'from-rose-500 to-amber-500';
		if (acc < 70) return 'from-amber-500 to-yellow-400';
		if (acc < 85) return 'from-blue-500 to-primary';
		return 'from-emerald-500 to-teal-400';
	}
</script>

<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs">
	<!-- Header with Filters & Search -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<Sparkles class="h-4 w-4 text-primary" aria-hidden="true" />
				<h3 class="font-display text-base font-bold text-text">Concept Strengths & Weaknesses</h3>
			</div>
			<p class="text-xs text-text-muted">
				Track topic accuracy and target high-priority improvement areas.
			</p>
		</div>

		<!-- Segmented Filter Tabs -->
		<div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-bg/80 p-1">
			<button
				type="button"
				onclick={() => (filterMode = 'all')}
				class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-all {filterMode ===
				'all'
					? 'bg-primary text-white shadow-xs'
					: 'text-text-muted hover:text-text'}"
			>
				All ({conceptList.length})
			</button>
			<button
				type="button"
				onclick={() => (filterMode = 'strengths')}
				class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-all {filterMode ===
				'strengths'
					? 'bg-emerald-600 text-white shadow-xs'
					: 'text-emerald-500 hover:bg-emerald-500/10'}"
			>
				Strengths ({strengthsCount})
			</button>
			<button
				type="button"
				onclick={() => (filterMode = 'weaknesses')}
				class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-all {filterMode ===
				'weaknesses'
					? 'bg-rose-600 text-white shadow-xs'
					: 'text-rose-500 hover:bg-rose-500/10'}"
			>
				Needs Work ({weaknessesCount})
			</button>
		</div>
	</div>

	<!-- Controls row: Search & Sort -->
	<div class="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative flex-1">
			<input
				type="text"
				placeholder="Search concept or topic..."
				bind:value={searchQuery}
				class="w-full rounded-xl border border-border bg-bg px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
			/>
		</div>

		<div class="flex items-center gap-2 text-xs text-text-muted">
			<Filter class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="text-[11px] font-semibold">Sort by:</span>
			<select
				bind:value={sortBy}
				class="cursor-pointer rounded-lg border border-border bg-bg px-2 py-1 text-xs font-medium text-text focus:border-primary focus:outline-none"
			>
				<option value="attempts">Most Practiced</option>
				<option value="accuracy_desc">Highest Accuracy</option>
				<option value="accuracy_asc">Lowest Accuracy (Focus)</option>
			</select>
		</div>
	</div>

	<!-- Concept Bars List -->
	{#if displayConcepts.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center"
		>
			<div
				class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-text-muted"
			>
				<Filter class="h-5 w-5" />
			</div>
			<p class="text-xs font-bold text-text">No concepts found</p>
			<p class="mt-0.5 text-[11px] text-text-muted">
				{searchQuery
					? 'Try searching with a different term'
					: filterMode === 'weaknesses'
						? 'Great job! No weak concepts identified.'
						: 'Answer quiz questions to build your concept mastery profile.'}
			</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each displayConcepts as item (item.conceptId)}
				{@const isStrong = item.accuracy >= 70}
				{@const isWeakArea = item.isWeak || item.accuracy < 70}
				{@const barColor = getBarColor(item.accuracy, item.isWeak)}

				<div
					class="group relative flex flex-col gap-2 rounded-xl border border-border bg-bg/50 p-3 transition-all hover:border-primary/40 hover:bg-surface-muted/40"
				>
					<!-- Top concept row -->
					<div class="flex items-center justify-between gap-3">
						<div class="flex min-w-0 items-center gap-2">
							{#if isStrong}
								<CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
							{:else}
								<AlertTriangle class="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
							{/if}
							<span class="truncate text-xs font-semibold text-text">
								{item.conceptTag || item.conceptId}
							</span>
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<span
								class="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase {isStrong
									? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
									: 'border border-rose-500/20 bg-rose-500/10 text-rose-500'}"
							>
								{isStrong ? 'Strength' : 'Growth Area'}
							</span>
							<span class="font-display text-xs font-black text-text">
								{item.accuracy}%
							</span>
						</div>
					</div>

					<!-- Animated Progress Bar -->
					<div class="relative h-2 w-full overflow-hidden rounded-full bg-border/50">
						<div
							class="h-full rounded-full bg-linear-to-r {barColor} transition-all duration-700 ease-out"
							style="width: {Math.max(4, item.accuracy)}%;"
						></div>
					</div>

					<!-- Bottom details & Action Link -->
					<div class="flex items-center justify-between text-[11px] text-text-muted">
						<span>
							{item.correctCount} of {item.totalAttempts} correct ({item.totalAttempts} attempts)
						</span>

						{#if isWeakArea}
							<a
								href="/app/mistakes"
								class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 hover:text-amber-400 hover:underline"
							>
								<span>Drill in Mistake Bank</span>
								<ArrowRight class="h-3 w-3" />
							</a>
						{:else}
							<span class="text-[10px] font-medium text-emerald-500">Mastered ✓</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
