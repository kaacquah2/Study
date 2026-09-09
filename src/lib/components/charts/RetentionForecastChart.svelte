<script lang="ts">
	interface Props {
		currentRetention?: number; // 0 - 100
		stabilityDays?: number; // e.g. 12.5 days
		dueCardCount?: number;
		title?: string;
	}

	let {
		currentRetention = 87,
		stabilityDays = 14,
		dueCardCount = 0,
		title = 'Retention Forecast & Memory Decay'
	}: Props = $props();

	// SVG Dimensions
	const width = 600;
	const height = 200;
	const padLeft = 45;
	const padRight = 25;
	const padTop = 20;
	const padBottom = 35;

	const chartW = width - padLeft - padRight;
	const chartH = height - padTop - padBottom;

	// Hover tracking
	let hoveredDay = $state<number | null>(null);

	// Generate 30 days of retention curve points
	// Standard Ebbinghaus / FSRS R = (1 + factor * t / S)^-1
	let curvePoints = $derived.by(() => {
		const points: Array<{
			day: number;
			retentionWithoutReview: number;
			retentionWithFSRS: number;
			x: number;
			yDecay: number;
			yFSRS: number;
			isReviewDay: boolean;
		}> = [];

		const totalDays = 30;
		const reviewDays = new Set([1, 3, 7, 14, 25]);

		for (let day = 0; day <= totalDays; day++) {
			const x = padLeft + (day / totalDays) * chartW;

			// Natural forgetting curve
			const decayVal = Math.max(15, Math.round(100 * Math.exp((-day * 1.5) / Math.max(stabilityDays, 5))));
			const yDecay = padTop + chartH - (decayVal / 100) * chartH;

			// Spaced repetition review curve (resets upward on review days)
			const fsrsVal =
				day < 1
					? 100
					: day < 3
						? Math.max(88, 100 - (day - 1) * 6)
						: day < 7
							? Math.max(90, 100 - (day - 3) * 2.5)
							: day < 14
								? Math.max(89, 100 - (day - 7) * 1.5)
								: Math.max(85, 100 - (day - 14) * 0.8);

			const yFSRS = padTop + chartH - (fsrsVal / 100) * chartH;

			points.push({
				day,
				retentionWithoutReview: decayVal,
				retentionWithFSRS: Math.round(fsrsVal),
				x,
				yDecay,
				yFSRS,
				isReviewDay: reviewDays.has(day)
			});
		}

		return points;
	});

	let decayPath = $derived.by(() => {
		if (curvePoints.length === 0) return '';
		return curvePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yDecay.toFixed(1)}`).join(' ');
	});

	let fsrsPath = $derived.by(() => {
		if (curvePoints.length === 0) return '';
		return curvePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yFSRS.toFixed(1)}`).join(' ');
	});

	let fsrsArea = $derived.by(() => {
		if (curvePoints.length === 0) return '';
		const base = padTop + chartH;
		const line = curvePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yFSRS.toFixed(1)}`).join(' ');
		const first = curvePoints[0];
		const last = curvePoints[curvePoints.length - 1];
		return `${line} L ${last.x} ${base} L ${first.x} ${base} Z`;
	});

	let activePoint = $derived(
		hoveredDay !== null ? curvePoints.find((p) => p.day === hoveredDay) : null
	);
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs">
	<!-- Header & Quick Metrics -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h3 class="font-display text-sm font-bold text-text">{title}</h3>
				<span class="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
					FSRS-Powered
				</span>
			</div>
			<p class="text-xs text-text-muted">
				Predicted knowledge retention over 30 days: spaced reviews keep memory stable.
			</p>
		</div>

		<div class="flex items-center gap-4">
			<div class="text-right">
				<span class="block text-[10px] font-bold tracking-wider text-text-muted uppercase">Estimated Retention</span>
				<span class="font-display text-base font-black text-emerald-500">{currentRetention}%</span>
			</div>
			<div class="h-7 w-px bg-border"></div>
			<div class="text-right">
				<span class="block text-[10px] font-bold tracking-wider text-text-muted uppercase">Memory Stability</span>
				<span class="font-display text-base font-black text-primary">~{stabilityDays}d</span>
			</div>
		</div>
	</div>

	<!-- Chart Area -->
	<div class="relative mt-2 w-full select-none">
		<svg
			viewBox="0 0 {width} {height}"
			class="h-44 w-full overflow-visible"
			aria-label="Retention forecast chart"
		>
			<defs>
				<linearGradient id="fsrsGrad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3" />
					<stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0" />
				</linearGradient>
			</defs>

			<!-- Horizontal Grid Lines (100%, 75%, 50%, 25%) -->
			{#each [100, 75, 50, 25] as pct (pct)}
				{@const y = padTop + chartH - (pct / 100) * chartH}
				<line
					x1={padLeft}
					y1={y}
					x2={width - padRight}
					y2={y}
					stroke="var(--border)"
					stroke-width="1"
					stroke-dasharray="3 3"
					stroke-opacity="0.6"
				/>
				<text
					x={padLeft - 8}
					y={y + 3}
					text-anchor="end"
					font-size="9"
					fill="var(--text-muted)"
					font-weight="600"
				>
					{pct}%
				</text>
			{/each}

			<!-- FSRS Area & Path -->
			<path d={fsrsArea} fill="url(#fsrsGrad)" />
			<path
				d={fsrsPath}
				fill="none"
				stroke="var(--primary)"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- Decay Curve (Unreviewed) -->
			<path
				d={decayPath}
				fill="none"
				stroke="var(--text-muted)"
				stroke-width="1.8"
				stroke-dasharray="4 4"
				stroke-opacity="0.7"
			/>

			<!-- Review Points (Pulsing dots on review days) -->
			{#each curvePoints.filter((p) => p.isReviewDay) as rp (rp.day)}
				<circle
					cx={rp.x}
					cy={rp.yFSRS}
					r="4"
					fill="var(--surface)"
					stroke="var(--primary)"
					stroke-width="2"
				/>
			{/each}

			<!-- Day Markers on X-Axis -->
			{#each [0, 7, 14, 21, 30] as day (day)}
				{@const x = padLeft + (day / 30) * chartW}
				<text
					x={x}
					y={height - 8}
					text-anchor="middle"
					font-size="9"
					fill="var(--text-muted)"
					font-weight="600"
				>
					{day === 0 ? 'Today' : `Day ${day}`}
				</text>
			{/each}

			<!-- Hover interaction trigger columns -->
			{#each curvePoints as p (p.day)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					x={p.x - chartW / 60}
					y={padTop}
					width={chartW / 30}
					height={chartH}
					fill="transparent"
					class="cursor-crosshair"
					onmouseenter={() => (hoveredDay = p.day)}
					onmouseleave={() => (hoveredDay = null)}
				/>
			{/each}

			<!-- Active Hover Indicator -->
			{#if activePoint}
				<line
					x1={activePoint.x}
					y1={padTop}
					x2={activePoint.x}
					y2={padTop + chartH}
					stroke="var(--text-muted)"
					stroke-width="1"
					stroke-dasharray="2 2"
				/>
				<circle
					cx={activePoint.x}
					cy={activePoint.yFSRS}
					r="5"
					fill="var(--primary)"
					stroke="white"
					stroke-width="2"
				/>
			{/if}
		</svg>

		<!-- Tooltip floating overlay -->
		{#if activePoint}
			<div
				class="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-lg"
				style="left: {(activePoint.x / width) * 100}%;"
			>
				<div class="text-[10px] font-bold text-text">
					{activePoint.day === 0 ? 'Today' : `In ${activePoint.day} Days`}
				</div>
				<div class="flex items-center gap-2 text-[11px] font-semibold">
					<span class="text-primary">With FSRS: {activePoint.retentionWithFSRS}%</span>
					<span class="text-text-muted">| Without: {activePoint.retentionWithoutReview}%</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Legend & Helper Note -->
	<div class="mt-1 flex flex-wrap items-center justify-between border-t border-border/50 pt-2 text-[11px] text-text-muted">
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-1.5">
				<span class="h-2 w-4 rounded-full bg-primary"></span>
				<span class="font-medium text-text">With Spaced Repetition</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-0.5 w-4 border-t-2 border-dashed border-text-muted"></span>
				<span>Forgetting Curve (No Reviews)</span>
			</div>
		</div>
		<div>
			{#if dueCardCount > 0}
				<span class="font-bold text-amber-500">⚡ {dueCardCount} flashcards due for review today</span>
			{:else}
				<span class="text-emerald-500">✓ All memory reviews up to date</span>
			{/if}
		</div>
	</div>
</div>
