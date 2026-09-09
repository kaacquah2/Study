<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import ThemeSwitcher from './ThemeSwitcher.svelte';
	import StreakChip from './StreakChip.svelte';
	import Avatar from './Avatar.svelte';
</script>

<header
	class="sticky top-0 z-40 flex items-center justify-between px-5 py-3"
	style="background: var(--surface-glass); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border-bottom: 1px solid var(--border); box-shadow: 0 1px 0 0 var(--border);"
>
	<!-- Logo Section -->
	<a
		href="/app"
		class="flex items-center gap-2.5 rounded-md text-text transition-opacity select-none hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
	>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-lg text-white"
			style="background: var(--primary); box-shadow: 0 2px 8px var(--primary-glow);"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-4.5 w-4.5"
			>
				<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
				<path d="M6 6h10" />
				<path d="M6 10h10" />
			</svg>
		</div>
		<span class="text-[15px] font-bold tracking-tight text-text">AI Study Buddy</span>
	</a>

	<!-- Middle: Theme Switcher -->
	<div class="hidden md:block">
		<ThemeSwitcher />
	</div>

	<!-- Right: Streak & Avatar/Auth controls -->
	<div class="flex items-center gap-3">
		{#if authStore.user}
			<StreakChip />

			<Avatar
				src={authStore.user.photoURL}
				name={authStore.user.displayName || authStore.user.email}
				size="md"
			/>

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
