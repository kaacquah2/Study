<script lang="ts">
	interface ActivityPoint {
		date: string; // YYYY-MM-DD
		label: string; // "Sep 1"
		count: number; // total activity/questions
		correct: number;
		incorrect: number;
		accuracy: number;
	}

	interface Props {
		points: ActivityPoint[];
		title?: string;
	}

	let { points = [], title = 'Daily Activity & Accuracy' }: Props = $props();

	// SVG Dimensions
	const width = 640;
	const height = 220;
	const padLeft = 40;
	const padRight = 20;
	const padTop = 25;
	const padBottom = 35;

	const chartW = width - padLeft - padRight;
	const chartH = height - padTop - padBottom;

	// Active hover index
	let hoveredIndex = $state<number | null>(null);

	// Calculate max count for scaling (minimum 5 so graph has headroom)
	let maxCount = $derived.by(() => {
		if (points.length === 0) return 5;
		const max = Math.max(...points.map((p) => p.count), 0);
		return Math.max(max + 2, 5);
	});

	// Coordinates of all points
	let mappedPoints = $derived.by(() => {
		if (points.length === 0) return [];
		const stepX = points.length > 1 ? chartW / (points.length - 1) : chartW / 2;

		return points.map((p, i) => {
			const x = padLeft + (points.length > 1 ? i * stepX : chartW / 2);
			const ratio = p.count / maxCount;
			const y = padTop + chartH - ratio * chartH;
			return { ...p, x, y, index: i };
		});
	});

	// Build smooth SVG path using Catmull-Rom or cubic spline
	let linePath = $derived.by(() => {
		if (mappedPoints.length === 0) return '';
		if (mappedPoints.length === 1) {
			const p = mappedPoints[0];
			return `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`;
		}

		let d = `M ${mappedPoints[0].x} ${mappedPoints[0].y}`;
		for (let i = 0; i < mappedPoints.length - 1; i++) {
			const current = mappedPoints[i];
			const next = mappedPoints[i + 1];
			const cX1 = current.x + (next.x - current.x) / 2;
			const cY1 = current.y;
			const cX2 = current.x + (next.x - current.x) / 2;
			const cY2 = next.y;
			d += ` C ${cX1} ${cY1}, ${cX2} ${cY2}, ${next.x} ${next.y}`;
		}
		return d;
	});

	// Build closed area polygon for gradient background
	let areaPath = $derived.by(() => {
		if (!linePath || mappedPoints.length === 0) return '';
		const first = mappedPoints[0];
		const last = mappedPoints[mappedPoints.length - 1];
		const bottomY = padTop + chartH;
		return `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
	});

	// Y-axis grid ticks (0%, 50%, 100% of max)
	let yTicks = $derived.by(() => {
		return [
			{ val: 0, y: padTop + chartH },
			{ val: Math.round(maxCount / 2), y: padTop + chartH / 2 },
			{ val: maxCount, y: padTop }
		];
	});

	// X-axis label selections (show at most ~6 labels to prevent clutter)
	let xLabels = $derived.by(() => {
		if (mappedPoints.length <= 7) return mappedPoints;
		const step = Math.ceil(mappedPoints.length / 6);
		return mappedPoints.filter(
			(_, i) => i === 0 || i === mappedPoints.length - 1 || i % step === 0
		);
	});

	function handleMouseMove(event: MouseEvent) {
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const mouseX = (event.clientX - rect.left) * (width / rect.width);

		if (mappedPoints.length === 0) return;

		// Find closest point by x coordinate
		let closestIdx = 0;
		let minDiff = Infinity;
		mappedPoints.forEach((p, idx) => {
			const diff = Math.abs(p.x - mouseX);
			if (diff < minDiff) {
				minDiff = diff;
				closestIdx = idx;
			}
		});

		hoveredIndex = closestIdx;
	}

	function handleMouseLeave() {
		hoveredIndex = null;
	}

	let hoveredPoint = $derived(
		hoveredIndex !== null && mappedPoints[hoveredIndex] ? mappedPoints[hoveredIndex] : null
	);
</script>

<div class="relative flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-xs">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-primary"></span>
			<h4 class="font-display text-sm font-bold text-text">{title}</h4>
		</div>
		<span class="text-xs font-semibold text-text-muted">Questions & Accuracy</span>
	</div>

	<!-- Interactive SVG Chart Area -->
	<div class="relative w-full overflow-hidden">
		<svg
			class="h-auto w-full cursor-crosshair select-none"
			viewBox="0 0 {width} {height}"
			onmousemove={handleMouseMove}
			onmouseleave={handleMouseLeave}
			role="img"
			aria-label="Daily activity and accuracy chart"
		>
			<defs>
				<linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3" />
					<stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0" />
				</linearGradient>
				<linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stop-color="#818cf8" />
					<stop offset="50%" stop-color="var(--primary)" />
					<stop offset="100%" stop-color="#38bdf8" />
				</linearGradient>
			</defs>

			<!-- Y-Axis Grid Lines & Ticks -->
			{#each yTicks as tick (tick.val)}
				<line
					x1={padLeft}
					y1={tick.y}
					x2={width - padRight}
					y2={tick.y}
					stroke="var(--border)"
					stroke-opacity="0.6"
					stroke-dasharray="4 4"
				/>
				<text
					x={padLeft - 8}
					y={tick.y + 4}
					text-anchor="end"
					fill="var(--text-subtle)"
					font-size="10"
					font-weight="600"
				>
					{tick.val}
				</text>
			{/each}

			<!-- Area Fill Under Curve -->
			{#if areaPath}
				<path d={areaPath} fill="url(#areaGradient)" />
			{/if}

			<!-- Smooth Activity Line -->
			{#if linePath}
				<path
					d={linePath}
					fill="none"
					stroke="url(#lineGradient)"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			<!-- X-Axis Labels -->
			{#each xLabels as lbl (lbl.date)}
				<text
					x={lbl.x}
					y={height - 10}
					text-anchor="middle"
					fill="var(--text-muted)"
					font-size="10"
					font-weight="500"
				>
					{lbl.label}
				</text>
			{/each}

			<!-- Data Circles -->
			{#each mappedPoints as pt (pt.date)}
				{#if pt.count > 0}
					<circle
						cx={pt.x}
						cy={pt.y}
						r={hoveredIndex === pt.index ? '6' : '3.5'}
						fill="var(--surface)"
						stroke="var(--primary)"
						stroke-width="2.5"
						style="transition: r 0.15s ease;"
					/>
				{/if}
			{/each}

			<!-- Vertical Crosshair Line on Hover -->
			{#if hoveredPoint}
				<line
					x1={hoveredPoint.x}
					y1={padTop}
					x2={hoveredPoint.x}
					y2={padTop + chartH}
					stroke="var(--primary)"
					stroke-width="1.5"
					stroke-dasharray="3 3"
				/>
				<circle
					cx={hoveredPoint.x}
					cy={hoveredPoint.y}
					r="7"
					fill="var(--primary)"
					stroke="white"
					stroke-width="2"
				/>
			{/if}
		</svg>

		<!-- Floating Tooltip Box on Hover -->
		{#if hoveredPoint}
			<div
				class="pointer-events-none absolute z-30 flex -translate-x-1/2 flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-900/95 px-3 py-2 text-white shadow-xl backdrop-blur-md transition-all duration-75"
				style="left: {(hoveredPoint.x / width) * 100}%; top: {Math.max(
					10,
					(hoveredPoint.y / height) * 100 - 35
				)}%;"
			>
				<div class="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-300">
					<span>{hoveredPoint.label}</span>
					<span class="py-0.2 rounded bg-primary/20 px-1.5 text-[10px] text-primary">
						{hoveredPoint.count} answered
					</span>
				</div>
				<div class="flex items-center gap-3 text-xs font-semibold">
					<span class="text-emerald-400">✓ {hoveredPoint.correct}</span>
					<span class="text-rose-400">✕ {hoveredPoint.incorrect}</span>
					{#if hoveredPoint.count > 0}
						<span class="ml-auto font-bold text-amber-300">
							{hoveredPoint.accuracy}%
						</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
