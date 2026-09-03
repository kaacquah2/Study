<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';

	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.longestStreak ?? authStore.profile?.streak?.longest ?? currentStreak
	);
	let lastStudiedOn = $derived(authStore.profile?.streak?.lastStudiedOn || null);

	/**
	 * Convert any date value to a local YYYY-MM-DD string.
	 * Using local date parts avoids the UTC-midnight parse bug where
	 * `new Date("2026-08-05")` is treated as UTC 00:00, which in timezones
	 * behind UTC maps to the *previous* local day.
	 */
	function toLocalDateStr(val: string | Date | { toDate?: () => Date } | null): string | null {
		if (!val) return null;
		const d =
			val &&
			typeof val === 'object' &&
			typeof (val as { toDate?: () => Date }).toDate === 'function'
				? (val as { toDate: () => Date }).toDate()
				: new Date(val as string | Date);
		if (isNaN(d.getTime())) return null;
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	/** Noon-anchored ms for a local YYYY-MM-DD string — immune to DST shifts. */
	function noonMs(dateStr: string): number {
		const [y, m, d] = dateStr.split('-').map(Number);
		return new Date(y, m - 1, d, 12, 0, 0).getTime();
	}

	// Generate grid for past 28 days (4 weeks × 7 days) ending today
	let gridDays = $derived.by(() => {
		const days: { dateStr: string; label: string; active: boolean; isToday: boolean }[] = [];
		const now = new Date();

		// Build last-studied string from local date parts of the stored value
		const lastDateStr = toLocalDateStr(lastStudiedOn);

		for (let i = 27; i >= 0; i--) {
			// Derive each day's local date from now, going back i days
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12, 0, 0);
			const year = d.getFullYear();
			const month = String(d.getMonth() + 1).padStart(2, '0');
			const day = String(d.getDate()).padStart(2, '0');
			const dateStr = `${year}-${month}-${day}`;
			const isToday = i === 0;

			// Compare using noon-anchored ms so timezone offsets can't cross a day boundary
			let active = false;
			if (lastDateStr) {
				const diffDays = Math.round((noonMs(lastDateStr) - noonMs(dateStr)) / 86400000);
				if (diffDays >= 0 && diffDays < currentStreak) {
					active = true;
				}
			}

			const monthName = d.toLocaleDateString('en-US', { month: 'short' });
			const dayNum = d.getDate();

			days.push({
				dateStr,
				label: `${monthName} ${dayNum}`,
				active,
				isToday
			});
		}
		return days;
	});

	let totalActiveDays = $derived(gridDays.filter((d) => d.active).length);
</script>

<div class="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5 shadow-xs">
	<!-- Slim Header with Caption & Inline Stat Row Above Grid -->
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-1.5 text-text-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
				<h4 class="font-display text-xs font-bold text-text">Activity</h4>
			</div>
			<span class="text-[10px] font-semibold text-text-muted">Last 4 weeks</span>
		</div>

		<!-- Stat pills placed above grid as single inline row -->
		<div class="flex items-center gap-1.5 text-[10px] font-bold">
			<span
				class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-500"
			>
				🔥 {currentStreak}d streak
			</span>
			<span class="text-text-muted/40">•</span>
			<span
				class="rounded-full border border-primary/30 bg-primary-soft/50 px-2 py-0.5 text-primary"
			>
				🏆 Best: {longestStreak}d
			</span>
		</div>
	</div>

	<!-- GitHub-style Contribution Heatmap Grid -->
	<div class="flex flex-col gap-1.5 pt-0.5">
		<div class="grid grid-cols-7 gap-1">
			{#each gridDays as day (day.dateStr)}
				<!--
					Use `overflow-visible` so the tooltip can escape the cell bounds
					without triggering layout reflow. The tooltip uses opacity/visibility
					transition instead of display:none→block to prevent the hover-flicker
					loop (display toggle causes reflow → cursor leaves cell → hover lost →
					tooltip hides → cursor back on cell → hover gained → repeat).
				-->
				<div
					class="group relative flex h-5.5 w-full cursor-help items-center justify-center overflow-visible rounded-md border transition-all duration-150 select-none {day.active
						? 'border-amber-500/50 bg-amber-500 font-bold text-slate-950 shadow-xs shadow-amber-500/30'
						: day.isToday
							? 'border-dashed border-primary bg-primary-soft/30 text-primary'
							: 'border-heatmap-empty-border bg-heatmap-empty-bg text-text-muted hover:border-border hover:brightness-95'}"
					aria-label={`${day.label}: ${day.active ? 'Studied' : 'No activity'}`}
				>
					{#if day.active}
						<span class="text-[9px]">✓</span>
					{:else if day.isToday}
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
					{/if}

					<!-- Tooltip — opacity/visibility transition; never triggers layout reflow -->
					<div
						class="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-xl border border-slate-700/60 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap text-white
						       opacity-0 shadow-xl transition-opacity duration-150 ease-out
						       group-hover:visible group-hover:opacity-100"
					>
						{day.label}: {day.active ? '1+ module studied 🔥' : 'No activity recorded'}
					</div>
				</div>
			{/each}
		</div>

		<!-- Legend Footer right-aligned under grid -->
		<div class="flex items-center justify-between pt-1 text-[9px] font-semibold text-text-muted">
			<span>{totalActiveDays} active day{totalActiveDays === 1 ? '' : 's'}</span>
			<div class="flex items-center gap-1 text-[9px]">
				<span>Less</span>
				<span class="h-2 w-2 rounded-xs border border-heatmap-empty-border bg-heatmap-empty-bg"
				></span>
				<span class="h-2 w-2 rounded-xs border border-amber-500/50 bg-amber-500"></span>
				<span>More</span>
			</div>
		</div>
	</div>
</div>
