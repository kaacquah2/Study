<script lang="ts">
	interface Props {
		correct: number;
		incorrect: number;
		skipped?: number;
		title?: string;
	}

	let { correct = 0, incorrect = 0, skipped = 0, title = 'Question Outcomes' }: Props = $props();

	let total = $derived(correct + incorrect + skipped);

	// Percentages
	let pctCorrect = $derived(total > 0 ? Math.round((correct / total) * 100) : 0);
	let pctIncorrect = $derived(total > 0 ? Math.round((incorrect / total) * 100) : 0);
	let pctSkipped = $derived(total > 0 ? Math.max(0, 100 - pctCorrect - pctIncorrect) : 0);

	// Geometry for SVG Donut (radius 50, stroke width 16)
	const radius = 50;
	const circumference = 2 * Math.PI * radius; // ~314.159

	// Calculate stroke offsets
	// Arc 1: Correct (Emerald)
	let lenCorrect = $derived(total > 0 ? (correct / total) * circumference : 0);
	// Arc 2: Incorrect (Rose)
	let lenIncorrect = $derived(total > 0 ? (incorrect / total) * circumference : 0);
	// Arc 3: Skipped (Slate)
	let lenSkipped = $derived(total > 0 ? (skipped / total) * circumference : 0);

	// Offsets: starting from 12 o'clock (-90deg)
	// Circle 1 offset: 0 (stroke-dasharray: lenCorrect, circumference)
	// Circle 2 offset: -lenCorrect
	// Circle 3 offset: -(lenCorrect + lenIncorrect)
	let offsetIncorrect = $derived(-lenCorrect);
	let offsetSkipped = $derived(-(lenCorrect + lenIncorrect));

	let hoveredSegment = $state<'correct' | 'incorrect' | 'skipped' | null>(null);
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs">
	<div class="flex items-center justify-between">
		<h4 class="font-display text-xs font-bold tracking-wider text-text uppercase">{title}</h4>
		<span class="text-[11px] font-semibold text-text-muted">{total} total</span>
	</div>

	<div class="flex flex-col items-center justify-center gap-4 sm:flex-row sm:justify-around">
		<!-- SVG Donut Chart -->
		<div class="relative flex items-center justify-center">
			<svg
				class="h-36 w-36 -rotate-90 transform"
				viewBox="0 0 140 140"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-label="Performance outcome donut chart"
			>
				<!-- Base Track -->
				<circle
					cx="70"
					cy="70"
					r={radius}
					stroke="currentColor"
					stroke-width="15"
					class="text-border/40"
				/>

				{#if total > 0}
					<!-- Correct Slice (Emerald) -->
					{#if correct > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx="70"
							cy="70"
							r={radius}
							stroke="#10b981"
							stroke-width={hoveredSegment === 'correct' ? '18' : '15'}
							stroke-linecap="butt"
							stroke-dasharray="{lenCorrect} {circumference}"
							stroke-dashoffset="0"
							class="cursor-pointer transition-all duration-200"
							onmouseenter={() => (hoveredSegment = 'correct')}
							onmouseleave={() => (hoveredSegment = null)}
						/>
					{/if}

					<!-- Incorrect Slice (Rose) -->
					{#if incorrect > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx="70"
							cy="70"
							r={radius}
							stroke="#f43f5e"
							stroke-width={hoveredSegment === 'incorrect' ? '18' : '15'}
							stroke-linecap="butt"
							stroke-dasharray="{lenIncorrect} {circumference}"
							stroke-dashoffset={offsetIncorrect}
							class="cursor-pointer transition-all duration-200"
							onmouseenter={() => (hoveredSegment = 'incorrect')}
							onmouseleave={() => (hoveredSegment = null)}
						/>
					{/if}

					<!-- Skipped Slice (Amber/Slate) -->
					{#if skipped > 0}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx="70"
							cy="70"
							r={radius}
							stroke="#94a3b8"
							stroke-width={hoveredSegment === 'skipped' ? '18' : '15'}
							stroke-linecap="butt"
							stroke-dasharray="{lenSkipped} {circumference}"
							stroke-dashoffset={offsetSkipped}
							class="cursor-pointer transition-all duration-200"
							onmouseenter={() => (hoveredSegment = 'skipped')}
							onmouseleave={() => (hoveredSegment = null)}
						/>
					{/if}
				{/if}
			</svg>

			<!-- Center Label -->
			<div
				class="absolute inset-0 flex flex-col items-center justify-center text-center select-none"
			>
				{#if hoveredSegment === 'correct'}
					<span class="text-xs font-bold text-emerald-500">Correct</span>
					<span class="font-display text-xl font-black text-text">{correct}</span>
					<span class="text-[10px] text-text-muted">{pctCorrect}%</span>
				{:else if hoveredSegment === 'incorrect'}
					<span class="text-xs font-bold text-rose-500">Missed</span>
					<span class="font-display text-xl font-black text-text">{incorrect}</span>
					<span class="text-[10px] text-text-muted">{pctIncorrect}%</span>
				{:else if hoveredSegment === 'skipped'}
					<span class="text-xs font-bold text-slate-400">Skipped</span>
					<span class="font-display text-xl font-black text-text">{skipped}</span>
					<span class="text-[10px] text-text-muted">{pctSkipped}%</span>
				{:else}
					<span class="font-display text-2xl font-black text-text">{pctCorrect}%</span>
					<span class="text-[10px] font-semibold text-text-muted uppercase">Pass Rate</span>
				{/if}
			</div>
		</div>

		<!-- Breakdown Legend & Stats -->
		<div class="flex min-w-32 flex-col gap-2">
			<!-- Correct -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors {hoveredSegment ===
				'correct'
					? 'bg-emerald-500/10'
					: 'hover:bg-surface-muted'}"
				onmouseenter={() => (hoveredSegment = 'correct')}
				onmouseleave={() => (hoveredSegment = null)}
			>
				<div class="flex items-center gap-2 text-xs font-semibold text-text">
					<span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
					<span>Correct</span>
				</div>
				<div class="flex items-baseline gap-1 text-xs">
					<span class="font-bold text-text">{correct}</span>
					<span class="text-[10px] text-text-muted">({pctCorrect}%)</span>
				</div>
			</div>

			<!-- Incorrect -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors {hoveredSegment ===
				'incorrect'
					? 'bg-rose-500/10'
					: 'hover:bg-surface-muted'}"
				onmouseenter={() => (hoveredSegment = 'incorrect')}
				onmouseleave={() => (hoveredSegment = null)}
			>
				<div class="flex items-center gap-2 text-xs font-semibold text-text">
					<span class="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
					<span>Needs Review</span>
				</div>
				<div class="flex items-baseline gap-1 text-xs">
					<span class="font-bold text-text">{incorrect}</span>
					<span class="text-[10px] text-text-muted">({pctIncorrect}%)</span>
				</div>
			</div>

			<!-- Skipped / Practice -->
			{#if skipped > 0}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors {hoveredSegment ===
					'skipped'
						? 'bg-slate-500/10'
						: 'hover:bg-surface-muted'}"
					onmouseenter={() => (hoveredSegment = 'skipped')}
					onmouseleave={() => (hoveredSegment = null)}
				>
					<div class="flex items-center gap-2 text-xs font-semibold text-text">
						<span class="h-2.5 w-2.5 rounded-full bg-slate-400"></span>
						<span>Skipped</span>
					</div>
					<div class="flex items-baseline gap-1 text-xs">
						<span class="font-bold text-text">{skipped}</span>
						<span class="text-[10px] text-text-muted">({pctSkipped}%)</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
