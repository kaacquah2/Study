<script lang="ts">
	interface DayRhythm {
		day: string; // 'Mon', 'Tue', ...
		fullName: string; // 'Monday'
		minutes: number;
		questions: number;
	}

	interface Props {
		weekData?: DayRhythm[];
		peakTime?: string;
		morningPct?: number;
		afternoonPct?: number;
		eveningPct?: number;
		title?: string;
	}

	let {
		weekData = [
			{ day: 'Mon', fullName: 'Monday', minutes: 35, questions: 14 },
			{ day: 'Tue', fullName: 'Tuesday', minutes: 45, questions: 18 },
			{ day: 'Wed', fullName: 'Wednesday', minutes: 20, questions: 8 },
			{ day: 'Thu', fullName: 'Thursday', minutes: 55, questions: 22 },
			{ day: 'Fri', fullName: 'Friday', minutes: 40, questions: 16 },
			{ day: 'Sat', fullName: 'Saturday', minutes: 60, questions: 25 },
			{ day: 'Sun', fullName: 'Sunday', minutes: 30, questions: 12 }
		],
		peakTime = 'Evening (7 PM - 10 PM)',
		morningPct = 25,
		afternoonPct = 35,
		eveningPct = 40,
		title = 'Weekly Study Rhythm & Focus Hours'
	}: Props = $props();

	let hoveredDay = $state<DayRhythm | null>(null);

	const maxMinutes = $derived.by(() => {
		const m = Math.max(...weekData.map((d) => d.minutes), 10);
		return Math.ceil(m / 10) * 10;
	});

	const totalMinutes = $derived(weekData.reduce((acc, d) => acc + d.minutes, 0));
	const formattedTotalTime = $derived.by(() => {
		const hours = Math.floor(totalMinutes / 60);
		const mins = totalMinutes % 60;
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins}m`;
	});
</script>

<div class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs">
	<!-- Top Bar -->
	<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h3 class="font-display text-sm font-bold text-text">{title}</h3>
				<span class="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
					Rhythm
				</span>
			</div>
			<p class="text-xs text-text-muted">
				Daily study consistency and your optimal learning time zones.
			</p>
		</div>

		<div class="text-left sm:text-right">
			<span class="block text-[10px] font-bold tracking-wider text-text-muted uppercase">This Week's Study</span>
			<span class="font-display text-base font-black text-text">{formattedTotalTime}</span>
		</div>
	</div>

	<!-- 7-Day Bar Visualization -->
	<div class="my-4">
		<div class="flex items-end justify-between gap-2 pt-4">
			{#each weekData as item (item.day)}
				{@const heightPct = Math.max(8, Math.round((item.minutes / maxMinutes) * 100))}
				{@const isTopDay = item.minutes === Math.max(...weekData.map((d) => d.minutes))}
				<div
					class="group relative flex flex-1 flex-col items-center gap-2 cursor-pointer"
					onmouseenter={() => (hoveredDay = item)}
					onmouseleave={() => (hoveredDay = null)}
					role="figure"
					aria-label="{item.fullName}: {item.minutes} minutes"
				>
					<!-- Tooltip -->
					{#if hoveredDay?.day === item.day}
						<div
							class="pointer-events-none absolute -top-11 z-20 whitespace-nowrap rounded-xl border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-text shadow-md"
						>
							<span>{item.fullName}: </span>
							<span class="text-primary">{item.minutes}m</span>
							<span class="text-text-muted font-normal"> ({item.questions} qs)</span>
						</div>
					{/if}

					<!-- Bar Column -->
					<div class="relative flex h-28 w-full max-w-9 items-end justify-center rounded-xl bg-surface-muted/60 p-1">
						<div
							class="w-full rounded-lg transition-all duration-300 {isTopDay
								? 'bg-linear-to-t from-primary to-indigo-500 shadow-xs'
								: 'bg-primary/40 group-hover:bg-primary/70'}"
							style="height: {heightPct}%;"
						></div>
					</div>

					<!-- Day Label -->
					<span
						class="text-[11px] font-bold {hoveredDay?.day === item.day
							? 'text-primary'
							: 'text-text-muted'}"
					>
						{item.day}
					</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Time-of-day split & Peak hours -->
	<div class="flex flex-col gap-3 border-t border-border/50 pt-3">
		<div class="flex items-center justify-between text-xs">
			<span class="text-text-muted">Peak Focus Window:</span>
			<span class="flex items-center gap-1.5 font-bold text-primary">
				<span>⚡</span> {peakTime}
			</span>
		</div>

		<!-- Segmented time-of-day bar -->
		<div class="flex flex-col gap-1.5">
			<div class="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
				<div
					class="h-full bg-amber-400 transition-all duration-500"
					style="width: {morningPct}%;"
					title="Morning: {morningPct}%"
				></div>
				<div
					class="h-full bg-sky-500 transition-all duration-500"
					style="width: {afternoonPct}%;"
					title="Afternoon: {afternoonPct}%"
				></div>
				<div
					class="h-full bg-indigo-500 transition-all duration-500"
					style="width: {eveningPct}%;"
					title="Evening: {eveningPct}%"
				></div>
			</div>

			<div class="flex items-center justify-between text-[10px] font-semibold text-text-muted">
				<span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-amber-400"></span> 🌅 Morning ({morningPct}%)</span>
				<span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-sky-500"></span> ☀️ Afternoon ({afternoonPct}%)</span>
				<span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-indigo-500"></span> 🌙 Evening ({eveningPct}%)</span>
			</div>
		</div>
	</div>
</div>
