<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';

	interface Props {
		badges?: string[];
	}

	let { badges = [] }: Props = $props();

	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);

	const allPossibleBadges = [
		{
			name: 'First Step',
			icon: '🎯',
			requirement: 'Complete your first lesson or quiz to unlock',
			requiredStreak: 1
		},
		{
			name: '3-Day Streak',
			icon: '🔥',
			requirement: 'Study 3 days in a row to unlock',
			requiredStreak: 3
		},
		{
			name: '7-Day Streak',
			icon: '⚡',
			requirement: 'Study 7 days in a row to unlock',
			requiredStreak: 7
		},
		{
			name: '14-Day Streak',
			icon: '🌟',
			requirement: 'Study 14 days in a row to unlock',
			requiredStreak: 14
		},
		{
			name: 'Course Master',
			icon: '🎓',
			requirement: 'Complete 100% of a course to unlock',
			requiredStreak: 0
		}
	];

	// Find the next locked badge target
	let nextBadgeTarget = $derived.by(() => {
		for (const b of allPossibleBadges) {
			if (!badges.includes(b.name)) {
				const remaining = b.requiredStreak > 0 ? Math.max(1, b.requiredStreak - currentStreak) : 0;
				const hint =
					b.requiredStreak > 0
						? `${remaining} more day${remaining === 1 ? '' : 's'} of study to unlock`
						: b.requirement;
				return { name: b.name, hint };
			}
		}
		return null;
	});
</script>

<div class="gap-3 flex flex-col">
	{#if nextBadgeTarget}
		<div
			class="gap-2 border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center rounded-xl border"
		>
			<span class="text-sm">🎯</span>
			<span
				><strong>Next Target:</strong> {nextBadgeTarget.name} &mdash; {nextBadgeTarget.hint}</span
			>
		</div>
	{/if}

	<div
		class="gap-2.5 flex flex-wrap items-center select-none"
		role="list"
		aria-label="Achievements badges"
	>
		{#each allPossibleBadges as b (b.name)}
			{@const unlocked = badges.includes(b.name)}
			{@const isNext = nextBadgeTarget?.name === b.name}
			{@const badgeAriaLabel = unlocked
				? `Unlocked badge: ${b.name}`
				: isNext
					? `Next target badge: ${b.name}, ${nextBadgeTarget?.hint}`
					: `Locked badge: ${b.name}, ${b.requirement}`}

			<div role="listitem">
				<button
					type="button"
					aria-label={badgeAriaLabel}
					class="group gap-1.5 px-3.5 py-2 text-xs font-bold relative inline-flex cursor-help items-center rounded-xl border transition-all duration-180 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary {unlocked
						? 'shadow-xs border-primary/40 bg-primary-soft/60 text-text'
						: isNext
							? 'border-amber-500/60 bg-amber-500/10 shadow-amber-500/10 ring-amber-500/20 text-text shadow-md ring-2'
							: 'border-border/80 bg-surface-muted text-text-muted hover:border-border hover:text-text'}"
				>
					<span>{b.icon}</span>
					<span>{b.name}</span>

					{#if unlocked}
						<span class="font-extrabold text-emerald-600 dark:text-emerald-400 text-[10px]">✓</span>
					{:else if isNext}
						<span
							class="py-0.2 bg-amber-500 px-1.5 font-black text-slate-950 rounded-full text-[9px] uppercase"
						>
							NEXT
						</span>
					{:else}
						<span class="text-[10px] opacity-60">🔒</span>
					{/if}

					<!-- Accessible Hover & Focus Tooltip -->
					<div
						class="mb-2 border-slate-700/60 bg-slate-900 px-3 py-1.5 font-semibold text-white shadow-xl pointer-events-none absolute bottom-full left-1/2 z-30 hidden -translate-x-1/2 rounded-xl border text-[11px] whitespace-nowrap transition-all group-hover:block group-focus-visible:block"
					>
						{#if unlocked}
							<div class="gap-1 text-emerald-400 flex items-center">
								<span>✓</span>
								<span>Unlocked! ({b.name})</span>
							</div>
						{:else if isNext}
							<div class="gap-1 text-amber-300 flex items-center">
								<span>🎯</span>
								<span>Next Target: {nextBadgeTarget?.hint}</span>
							</div>
						{:else}
							<div class="gap-1 text-slate-300 flex items-center">
								<span>🔒</span>
								<span>{b.requirement}</span>
							</div>
						{/if}
					</div>
				</button>
			</div>
		{/each}
	</div>
</div>
