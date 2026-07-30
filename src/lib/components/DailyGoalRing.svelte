<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';

	// Compute today's date formatted as YYYY-MM-DD
	let isCompletedToday = $derived.by(() => {
		const last = authStore.profile?.streak?.lastStudiedOn;
		if (!last) return false;

		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const todayStr = `${year}-${month}-${day}`;

		return last === todayStr;
	});
</script>

{#if authStore.user}
	<div
		class="group relative inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all duration-180 select-none {isCompletedToday
			? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
			: 'border-border bg-surface text-text-muted hover:border-amber-500/40 hover:text-text'}"
		role="status"
		aria-label={isCompletedToday
			? 'Daily goal status: Completed 1 of 1 lesson today'
			: 'Daily goal status: 0 of 1 lesson completed today'}
	>
		<!-- Progress Ring / Checkbox Icon -->
		<div class="relative flex h-4.5 w-4.5 items-center justify-center">
			<svg class="h-4.5 w-4.5 -rotate-90 transform" viewBox="0 0 24 24">
				<!-- Background Ring Track -->
				<circle
					cx="12"
					cy="12"
					r="9"
					fill="none"
					stroke="currentColor"
					stroke-opacity="0.2"
					stroke-width="3"
				/>
				<!-- Active Ring Fill -->
				<circle
					cx="12"
					cy="12"
					r="9"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-dasharray="56.5"
					stroke-dashoffset={isCompletedToday ? '0' : '56.5'}
					class="transition-all duration-500 ease-out"
				/>
			</svg>

			{#if isCompletedToday}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="absolute h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400"
				>
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{:else}
				<div class="absolute h-1.5 w-1.5 rounded-full bg-amber-500/80"></div>
			{/if}
		</div>

		<span class="text-[11px] font-bold">
			{isCompletedToday ? '1/1 Goal' : '0/1 Today'}
		</span>

		<!-- Hover Tooltip -->
		<div
			class="pointer-events-none absolute top-full left-1/2 z-30 mt-2 hidden -translate-x-1/2 rounded-xl border border-slate-700/60 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-xl transition-all group-hover:block"
		>
			{#if isCompletedToday}
				<div class="flex items-center gap-1.5 text-emerald-400">
					<span>🎉</span>
					<span>Daily Goal Complete! (1 lesson studied today)</span>
				</div>
			{:else}
				<div class="flex items-center gap-1.5 text-amber-300">
					<span>🎯</span>
					<span>Complete 1 lesson today to keep your streak active!</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
