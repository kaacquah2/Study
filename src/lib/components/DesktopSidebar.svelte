<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';

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

	// Nav section groupings — indices into navItems array
	// Dashboard(0), +New Course(1), Explore(2) → LEARN
	// Knowledge Map(3), Study Library(4) → MAP & STUDY
	// Practice & Review(5) → PRACTICE
	// Study Groups(6) → COMMUNITY
	const sectionBreaks: Record<number, string> = {
		3: 'Map & Study',
		5: 'Practice',
		6: 'Community'
	};
</script>

<aside
	class="top-0 w-56 md:flex xl:w-64 sticky z-30 hidden h-screen shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-surface select-none"
>
	<!-- Fixed Top Zone -->
	<div class="gap-4 p-4 pb-2 xl:gap-6 xl:p-5 xl:pb-3 flex shrink-0 flex-col">
		<a href="/app" class="gap-3 flex items-center">
			<div
				class="h-10 w-10 text-white flex items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20"
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
			<div class="min-w-0">
				<span
					class="font-display text-sm font-bold tracking-tight xl:text-base block truncate text-text"
					>AI Study Buddy</span
				>
				<span class="font-semibold block truncate text-[10px] text-text-muted"
					>Interactive AI Tutor</span
				>
			</div>
		</a>

		<nav class="gap-1 xl:gap-1.5 flex flex-col">
			<!-- AI Study Tutor Prominent Quick Action -->
			<button
				type="button"
				onclick={() => chatStore.toggle()}
				class="mb-1 gap-2.5 px-3 py-2.5 text-xs font-bold shadow-xs hover:text-white xl:px-4 xl:py-2.5 flex w-full cursor-pointer items-center justify-between rounded-xl border border-primary/30 bg-primary-soft/50 text-primary transition-all duration-180 hover:bg-primary"
				aria-label="Open AI Study Tutor"
			>
				<div class="gap-2.5 flex items-center truncate">
					<span class="text-base leading-none">✨</span>
					<span class="truncate">AI Study Tutor</span>
				</div>
				<span
					class="px-1.5 py-0.5 font-black group-hover:bg-white/20 group-hover:text-white rounded-md bg-primary/10 text-[10px] text-primary uppercase transition-colors"
				>
					{chatStore.isOpen ? 'Open' : 'Chat'}
				</span>
			</button>

			{#each navItems as item, idx (item.href)}
				{#if sectionBreaks[idx]}
					<div
						class="mt-2.5 mb-1 px-3 font-black tracking-wider text-[10px] text-text-muted/60 uppercase"
					>
						{sectionBreaks[idx]}
					</div>
				{/if}
				{@const active =
					currentPath === item.href || (item.href !== '/app' && currentPath.startsWith(item.href))}
				<a
					href={item.href}
					class="gap-2.5 px-3 py-2 text-xs font-bold xl:px-4 xl:py-2.5 flex items-center rounded-xl transition-all duration-180 {active
						? 'text-white bg-primary shadow-md shadow-primary/20'
						: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
					</svg>
					<span class="truncate">{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>

	<!-- Scrollable Middle Zone -->
	<div class="min-h-0 px-5 py-2 flex-1 scrollbar-thin overflow-y-auto">
		<StreakHeatmap />
	</div>

	<!-- Fixed Bottom Zone -->
	<div class="gap-2.5 p-4 pt-3 relative flex shrink-0 flex-col border-t border-border/80">
		<div class="px-2 text-xs font-bold flex items-center justify-between text-text-muted">
			<span>Theme</span>
			<ThemeSwitcher />
		</div>

		<div class="relative">
			{#if sidebarProfileOpen}
				<div
					class="left-0 mb-3 gap-3 rounded-2xl p-3 shadow-2xl absolute bottom-full z-50 flex w-full flex-col border border-border bg-surface transition-all duration-180"
				>
					<div class="gap-3 pb-3 flex items-center border-b border-border/60">
						{#if authStore.user?.photoURL}
							<img
								src={authStore.user.photoURL}
								alt={authStore.user.displayName || 'User'}
								class="h-9 w-9 rounded-full border border-border object-cover"
							/>
						{:else}
							<div
								class="h-9 w-9 text-xs font-bold flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
							>
								{userInitials}
							</div>
						{/if}
						<div class="min-w-0 truncate">
							<span class="text-xs font-bold block truncate text-text">
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

					<div class="gap-1 text-xs font-semibold flex flex-col">
						<a
							href="/app/settings"
							onclick={() => (sidebarProfileOpen = false)}
							class="px-3 py-2 flex items-center justify-between rounded-xl text-text transition-colors hover:bg-surface-muted"
						>
							<div class="gap-2.5 flex items-center">
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
									class="px-2 py-0.5 font-bold rounded-full bg-primary-soft/80 text-[10px] text-primary"
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
						class="gap-2 py-2.5 text-xs font-bold flex w-full cursor-pointer items-center justify-center rounded-xl bg-danger-soft text-danger transition-all hover:bg-danger/15 active:scale-95"
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
				class="group gap-2.5 px-2 py-1.5 flex w-full cursor-pointer items-center justify-between rounded-xl border border-transparent text-left transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
			>
				<div class="gap-2.5 flex items-center overflow-hidden">
					{#if authStore.user?.photoURL}
						<img
							src={authStore.user.photoURL}
							alt={authStore.user.displayName || 'User'}
							class="h-8 w-8 rounded-full border border-border object-cover"
						/>
					{:else}
						<div
							class="h-8 w-8 text-xs font-bold flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
						>
							{userInitials}
						</div>
					{/if}
					<div class="min-w-0 truncate">
						<span
							class="text-xs font-bold block truncate text-text transition-colors group-hover:text-primary"
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
