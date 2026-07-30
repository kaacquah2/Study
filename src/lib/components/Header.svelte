<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import ThemeSwitcher from './ThemeSwitcher.svelte';
	import StreakChip from './StreakChip.svelte';
	import { resolve } from '$app/paths';

	let initials = $derived.by(() => {
		if (authStore.user?.displayName) {
			return authStore.user.displayName
				.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
		}
		if (authStore.user?.email) {
			return authStore.user.email.slice(0, 2).toUpperCase();
		}
		return '??';
	});
</script>

<header
	class="flex items-center justify-between border-b border-border bg-surface px-6 py-4 shadow-sm"
>
	<!-- Logo Section -->
	<a
		href={resolve('/app')}
		class="flex items-center gap-2 rounded-md text-lg font-bold text-text transition-opacity select-none hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
	>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white shadow-sm"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4.5 w-4.5"
			>
				<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
				<path d="M6 6h10" />
				<path d="M6 10h10" />
			</svg>
		</div>
		<span class="font-display tracking-tight">AI Study Buddy</span>
	</a>

	<!-- Middle: Theme Switcher -->
	<div class="hidden md:block">
		<ThemeSwitcher />
	</div>

	<!-- Right: Streak & Avatar/Auth controls -->
	<div class="flex items-center gap-3">
		{#if authStore.user}
			<StreakChip />

			{#if authStore.user.photoURL}
				<img
					src={authStore.user.photoURL}
					alt={authStore.user.displayName || 'User'}
					loading="lazy"
					class="h-8 w-8 rounded-full border border-border object-cover"
				/>
			{:else}
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full border border-primary/10 bg-primary-soft text-xs font-bold text-text shadow-sm select-none"
				>
					{initials}
				</div>
			{/if}

			<button
				type="button"
				class="ml-1 cursor-pointer rounded-md p-2.5 text-xs font-semibold text-text-muted transition-all duration-180 hover:bg-danger-soft hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger active:scale-95"
				onclick={() => authStore.logout()}
			>
				Sign out
			</button>
		{:else}
			<div class="block md:hidden">
				<ThemeSwitcher />
			</div>
		{/if}
	</div>
</header>
