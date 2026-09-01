<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import DailyGoalRing from './DailyGoalRing.svelte';

	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.longestStreak ?? authStore.profile?.streak?.longest ?? currentStreak
	);
</script>

{#if authStore.user}
	<div class="gap-2 inline-flex items-center">
		<DailyGoalRing />

		<div
			class="group gap-2 border-amber-500/30 bg-amber-500/10 py-1 pr-3 pl-2 shadow-xs relative inline-flex cursor-help items-center rounded-full border select-none"
			role="status"
			aria-label={`Current study streak: ${currentStreak} days`}
		>
			<div
				class="h-6 min-w-6 bg-amber-500 px-1.5 text-xs font-bold text-slate-950 shadow-inner flex items-center justify-center rounded-full text-center"
			>
				🔥 {currentStreak}
			</div>
			<span class="font-bold tracking-wider text-amber-500 text-[10px] uppercase">
				{currentStreak === 1 ? 'day streak' : 'days streak'}
			</span>

			<!-- Hover Tooltip showing longest streak -->
			<div
				class="mt-2 border-slate-700/60 bg-slate-900 px-3 py-1.5 font-semibold text-white shadow-xl pointer-events-none absolute top-full left-1/2 z-30 hidden -translate-x-1/2 rounded-xl border text-[11px] whitespace-nowrap transition-all group-hover:block"
			>
				🏆 Longest Streak: {longestStreak} day{longestStreak === 1 ? '' : 's'}
			</div>
		</div>
	</div>
{/if}
