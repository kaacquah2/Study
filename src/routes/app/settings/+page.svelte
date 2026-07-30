<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import BadgeStrip from '$lib/components/BadgeStrip.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';

	let displayName = $derived(
		authStore.user?.displayName || authStore.profile?.displayName || 'Student'
	);
	let email = $derived(authStore.user?.email || authStore.profile?.email || 'No email provided');
	let photoURL = $derived(authStore.user?.photoURL || authStore.profile?.photoURL);
	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.longestStreak ?? authStore.profile?.streak?.longest ?? currentStreak
	);
	let lastStudiedOn = $derived(authStore.profile?.streak?.lastStudiedOn);
	let userBadges = $derived(authStore.profile?.badges ?? []);

	let initials = $derived.by(() => {
		if (displayName && displayName !== 'Student') {
			return displayName
				.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
		}
		return email.slice(0, 2).toUpperCase();
	});
</script>

<svelte:head>
	<title>Profile &amp; Settings &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
	<!-- Profile Header Banner -->
	<div
		class="flex flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:p-8"
	>
		<div class="flex items-center gap-5">
			{#if photoURL}
				<img
					src={photoURL}
					alt={displayName}
					class="h-16 w-16 rounded-2xl border-2 border-primary/20 object-cover shadow-md"
				/>
			{:else}
				<div
					class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-xl font-black text-primary shadow-inner"
				>
					{initials}
				</div>
			{/if}

			<div>
				<h1 class="font-display text-xl font-bold text-text sm:text-2xl">{displayName}</h1>
				<p class="mt-0.5 text-xs text-text-muted sm:text-sm">{email}</p>
				<div
					class="mt-2.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft/60 px-3 py-0.5 text-[11px] font-semibold text-primary"
				>
					<span>🔥 Current Streak: {currentStreak} {currentStreak === 1 ? 'day' : 'days'}</span>
				</div>
			</div>
		</div>

		<button
			type="button"
			onclick={() => authStore.logout()}
			class="inline-flex cursor-pointer items-center justify-center gap-2 self-stretch rounded-2xl bg-danger-soft px-5 py-2.5 text-xs font-bold text-danger transition-all duration-180 hover:bg-danger/15 active:scale-95 sm:self-auto"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
				/>
			</svg>
			<span>Sign out</span>
		</button>
	</div>

	<!-- Streak & Activity Overview -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>⚡</span>
				<span>Streak Statistics</span>
			</h3>
			<div class="grid grid-cols-2 gap-4">
				<div class="rounded-2xl border border-border/50 bg-surface-muted p-4">
					<span class="block text-[11px] font-semibold tracking-wider text-text-muted uppercase"
						>Current Streak</span
					>
					<span class="mt-1 block text-2xl font-black text-primary"
						>{currentStreak} <span class="text-xs font-semibold">days</span></span
					>
				</div>
				<div class="rounded-2xl border border-border/50 bg-surface-muted p-4">
					<span class="block text-[11px] font-semibold tracking-wider text-text-muted uppercase"
						>Longest Streak</span
					>
					<span class="mt-1 block text-2xl font-black text-text"
						>{longestStreak} <span class="text-xs font-semibold">days</span></span
					>
				</div>
			</div>
			{#if lastStudiedOn}
				<p class="text-xs text-text-muted">
					Last study activity recorded on <span class="font-semibold text-text"
						>{new Date(lastStudiedOn).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span
					>.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>🎨</span>
				<span>Appearance & Preferences</span>
			</h3>
			<div
				class="flex items-center justify-between rounded-2xl border border-border/50 bg-surface-muted p-4"
			>
				<div>
					<span class="block text-xs font-bold text-text">Theme Preference</span>
					<span class="block text-[11px] text-text-muted"
						>Switch between light, dark, or system mode</span
					>
				</div>
				<ThemeSwitcher />
			</div>
		</div>
	</div>

	<!-- Activity Calendar Heatmap -->
	<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
		<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
			<span>📅</span>
			<span>Study Activity History</span>
		</h3>
		<StreakHeatmap />
	</div>

	<!-- Achievements & Badges -->
	<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>🏆</span>
				<span>Unlocked Achievements</span>
			</h3>
			<span class="text-xs font-semibold text-text-muted">{userBadges.length} of 5 badges</span>
		</div>
		<BadgeStrip badges={userBadges} />
	</div>
</div>
