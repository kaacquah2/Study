<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: string }>;
	}

	let { currentPath, navItems }: Props = $props();

	let sidebarProfileOpen = $state(false);

	let userInitials = $derived.by(() => {
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

<aside
	class="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-surface select-none md:flex"
>
	<!-- Fixed Top Zone -->
	<div class="flex shrink-0 flex-col gap-6 p-5 pb-3">
		<a href="/app" class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
					<path d="M6 10h10" />
				</svg>
			</div>
			<div>
				<span class="font-display text-base font-bold tracking-tight text-text">AI Study Buddy</span
				>
				<span class="block text-[10px] font-semibold text-text-muted">Interactive AI Tutor</span>
			</div>
		</a>

		<nav class="flex flex-col gap-2">
			{#each navItems as item (item.href)}
				{@const active =
					currentPath === item.href || (item.href !== '/app' && currentPath.startsWith(item.href))}
				<a
					href={item.href}
					class="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all duration-180 {active
						? 'bg-primary text-white shadow-md shadow-primary/20'
						: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4.5 w-4.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
					</svg>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>

	<!-- Scrollable Middle Zone -->
	<div class="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-5 py-2">
		<StreakHeatmap />
	</div>

	<!-- Fixed Bottom Zone -->
	<div class="relative flex shrink-0 flex-col gap-2.5 border-t border-border/80 p-4 pt-3">
		<div class="flex items-center justify-between px-2 text-xs font-bold text-text-muted">
			<span>Theme</span>
			<ThemeSwitcher />
		</div>

		<div class="relative">
			{#if sidebarProfileOpen}
				<div
					class="absolute bottom-full left-0 z-50 mb-3 flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl transition-all duration-180"
				>
					<div class="flex items-center gap-3 border-b border-border/60 pb-3">
						{#if authStore.user?.photoURL}
							<img
								src={authStore.user.photoURL}
								alt={authStore.user.displayName || 'User'}
								class="h-9 w-9 rounded-full border border-border object-cover"
							/>
						{:else}
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
							>
								{userInitials}
							</div>
						{/if}
						<div class="min-w-0 truncate">
							<span class="block truncate text-xs font-bold text-text">
								{authStore.user?.displayName || authStore.profile?.displayName || 'Student'}
							</span>
							<span
								class="block truncate text-[11px] text-text-muted"
								title={authStore.user?.email || ''}
							>
								{authStore.user?.email || 'Logged in'}
							</span>
						</div>
					</div>

					<div class="flex flex-col gap-1 text-xs font-semibold">
						<a
							href="/app/settings"
							onclick={() => (sidebarProfileOpen = false)}
							class="flex items-center justify-between rounded-xl px-3 py-2 text-text transition-colors hover:bg-surface-muted"
						>
							<div class="flex items-center gap-2.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 text-text-muted"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
								<span>Profile & Settings</span>
							</div>
							{#if authStore.profile?.streak?.current}
								<span
									class="rounded-full bg-primary-soft/80 px-2 py-0.5 text-[10px] font-bold text-primary"
								>
									🔥 {authStore.profile.streak.current}d
								</span>
							{/if}
						</a>
					</div>

					<button
						type="button"
						onclick={() => {
							sidebarProfileOpen = false;
							authStore.logout();
						}}
						class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger-soft py-2.5 text-xs font-bold text-danger transition-all hover:bg-danger/15 active:scale-95"
					>
						<span>Log out</span>
					</button>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => (sidebarProfileOpen = !sidebarProfileOpen)}
				aria-label="User account menu"
				aria-expanded={sidebarProfileOpen}
				class="group flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
			>
				<div class="flex items-center gap-2.5 overflow-hidden">
					{#if authStore.user?.photoURL}
						<img
							src={authStore.user.photoURL}
							alt={authStore.user.displayName || 'User'}
							class="h-8 w-8 rounded-full border border-border object-cover"
						/>
					{:else}
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
						>
							{userInitials}
						</div>
					{/if}
					<div class="min-w-0 truncate">
						<span
							class="block truncate text-xs font-bold text-text transition-colors group-hover:text-primary"
							>{authStore.user?.displayName || authStore.user?.email || 'Student'}</span
						>
						<span class="block truncate text-[10px] text-text-muted">Account settings</span>
					</div>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:text-text {sidebarProfileOpen
						? 'rotate-180'
						: ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
				</svg>
			</button>
		</div>
	</div>
</aside>
