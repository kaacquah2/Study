<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import DailyGoalRing from './DailyGoalRing.svelte';

	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.longestStreak ?? authStore.profile?.streak?.longest ?? currentStreak
	);
</script>

{#if authStore.user}
	<div class="inline-flex items-center gap-2">
		<DailyGoalRing />

		<div
			class="group relative inline-flex cursor-help items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 py-1 pr-3 pl-2 shadow-xs select-none"
			role="status"
			aria-label={`Current study streak: ${currentStreak} days`}
		>
			<div
				class="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-center text-xs font-bold text-slate-950 shadow-inner"
			>
				🔥 {currentStreak}
			</div>
			<span class="text-[10px] font-bold tracking-wider text-amber-500 uppercase">
				{currentStreak === 1 ? 'day streak' : 'days streak'}
			</span>

			<!-- Hover Tooltip showing longest streak -->
			<div
				class="pointer-events-none absolute top-full left-1/2 z-30 mt-2 hidden -translate-x-1/2 rounded-xl border border-slate-700/60 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-xl transition-all group-hover:block"
			>
				🏆 Longest Streak: {longestStreak} day{longestStreak === 1 ? '' : 's'}
			</div>
		</div>
	</div>
{/if}
