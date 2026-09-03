<script lang="ts">
	import type { Component } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import {
		BookOpen,
		Sparkles,
		Settings,
		Flame,
		LogOut,
		ChevronUp,
		Crown,
		ShieldCheck
	} from '@lucide/svelte';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: Component }>;
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

	let isSuperAdmin = $derived(
		Boolean(authStore.profile?.role === 'superadmin' || authStore.profile?.isSuperAdmin)
	);

	let isAdmin = $derived(
		Boolean(
			authStore.profile?.role === 'admin' ||
			authStore.profile?.isAdmin ||
			authStore.profile?.role === 'superadmin' ||
			authStore.profile?.isSuperAdmin
		)
	);

	// Nav section groupings — keyed by route href
	const sectionBreaks: Record<string, string> = {
		'/app/knowledge-map': 'Map & Study',
		'/app/review': 'Practice',
		'/app/study-groups': 'Community',
		'/app/admin': 'Administration'
	};
</script>

<aside
	class="sticky top-0 z-30 hidden h-screen w-56 shrink-0 flex-col justify-between overflow-hidden border-r select-none md:flex xl:w-64"
	style="background: var(--surface); border-color: var(--border); box-shadow: 1px 0 0 0 var(--border);"
>
	<!-- Fixed Top Zone -->
	<div class="flex shrink-0 flex-col gap-4 p-4 pb-2 xl:gap-6 xl:p-5 xl:pb-3">
		<a href="/app" class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-primary/20 shadow-md"
			>
				<BookOpen class="h-5 w-5" aria-hidden="true" />
			</div>
			<div class="min-w-0">
				<span
					class="block truncate font-display text-sm font-bold tracking-tight text-text xl:text-base"
					>AI Study Buddy</span
				>
				<span class="block truncate text-[10px] font-semibold text-text-muted"
					>Interactive AI Tutor</span
				>
			</div>
		</a>

		<nav class="flex flex-col gap-1 xl:gap-1.5">
			<!-- AI Study Tutor Prominent Quick Action -->
			<button
				type="button"
				onclick={() => chatStore.toggle()}
				class="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 xl:px-4 xl:py-2.5"
				style="border: 1px solid var(--primary-glow); background: var(--primary-soft); color: var(--primary); box-shadow: 0 0 0 0 var(--primary-glow);"
				onmouseenter={(e) => {
					(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px var(--primary-glow)';
				}}
				onmouseleave={(e) => {
					(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 var(--primary-glow)';
				}}
				aria-label="Open AI Study Tutor"
			>
				<div class="flex items-center gap-2 truncate">
					<Sparkles class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="truncate font-semibold">AI Study Tutor</span>
				</div>
				<span
					class="rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
					style="background: var(--primary-glow); color: var(--primary);"
				>
					{chatStore.isOpen ? 'Open' : 'Chat'}
				</span>
			</button>

			{#each navItems as item (item.href)}
				{#if sectionBreaks[item.href]}
					<div class="mt-3 mb-1 flex items-center gap-2 px-3">
						<div class="h-px flex-1" style="background: var(--border);"></div>
						<span
							class="text-[9px] font-bold tracking-widest uppercase"
							style="color: var(--text-subtle);"
						>
							{sectionBreaks[item.href]}
						</span>
						<div class="h-px flex-1" style="background: var(--border);"></div>
					</div>
				{/if}
				{@const active =
					currentPath === item.href || (item.href !== '/app' && currentPath.startsWith(item.href))}
				{@const Icon = item.icon}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 xl:px-4 xl:py-2"
					style={active
						? 'background: var(--primary-soft); color: var(--primary); font-weight: 600;'
						: 'color: var(--text-muted);'}
					onmouseenter={(e) => {
						if (!active)
							(e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-muted)';
						(e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)';
					}}
					onmouseleave={(e) => {
						if (!active) {
							(e.currentTarget as HTMLAnchorElement).style.background = '';
							(e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
						}
					}}
				>
					<!-- Left accent bar for active state -->
					{#if active}
						<span
							class="absolute top-1/2 left-0 h-4 w-0.75 -translate-y-1/2 rounded-full"
							style="background: var(--primary);"
						></span>
					{/if}
					<Icon class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{item.label}</span>
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
					role="menu"
					aria-label="User profile options"
					class="absolute bottom-full left-0 z-50 mb-3 flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl transition-all duration-180"
				>
					<div class="flex items-center gap-3 border-b border-border/60 pb-3">
						{#if authStore.user?.photoURL}
							<img
								src={authStore.user.photoURL}
								alt={authStore.user.displayName || 'User profile picture'}
								class="h-9 w-9 rounded-full border border-border object-cover"
							/>
						{:else}
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
								aria-hidden="true"
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
							role="menuitem"
							onclick={() => (sidebarProfileOpen = false)}
							class="flex items-center justify-between rounded-xl px-3 py-2 text-text transition-colors hover:bg-surface-muted"
						>
							<div class="flex items-center gap-2.5">
								<Settings class="h-4 w-4 text-text-muted" aria-hidden="true" />
								<span>Profile & Settings</span>
							</div>
							{#if authStore.profile?.streak?.current}
								<span
									class="flex items-center gap-1 rounded-full bg-primary-soft/80 px-2 py-0.5 text-[10px] font-bold text-primary"
								>
									<Flame class="inline h-3 w-3 text-amber-500" aria-hidden="true" />
									{authStore.profile.streak.current}d
								</span>
							{/if}
						</a>

						{#if isSuperAdmin}
							<a
								href="/superadmin"
								role="menuitem"
								onclick={() => (sidebarProfileOpen = false)}
								class="flex items-center gap-2.5 rounded-xl bg-violet-500/10 px-3 py-2 font-bold text-violet-500 transition-colors hover:bg-violet-500/20"
							>
								<Crown class="h-4 w-4 shrink-0" aria-hidden="true" />
								<span>Super Admin Console</span>
							</a>
						{/if}

						{#if isAdmin}
							<a
								href="/app/admin"
								role="menuitem"
								onclick={() => (sidebarProfileOpen = false)}
								class="flex items-center gap-2.5 rounded-xl bg-primary-soft/60 px-3 py-2 font-bold text-primary transition-colors hover:bg-primary-soft"
							>
								<ShieldCheck class="h-4 w-4 shrink-0" aria-hidden="true" />
								<span>Admin Dashboard</span>
							</a>
						{/if}
					</div>

					<button
						type="button"
						role="menuitem"
						onclick={() => {
							sidebarProfileOpen = false;
							authStore.logout();
						}}
						class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger-soft py-2.5 text-xs font-bold text-danger transition-all hover:bg-danger/15 active:scale-95"
					>
						<LogOut class="h-4 w-4" aria-hidden="true" />
						<span>Log out</span>
					</button>
				</div>
			{/if}

			<button
				type="button"
				onclick={() => (sidebarProfileOpen = !sidebarProfileOpen)}
				aria-label="User account menu"
				aria-haspopup="menu"
				aria-expanded={sidebarProfileOpen}
				class="group flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
			>
				<div class="flex items-center gap-2.5 overflow-hidden">
					{#if authStore.user?.photoURL}
						<img
							src={authStore.user.photoURL}
							alt={authStore.user.displayName || 'User profile picture'}
							class="h-8 w-8 rounded-full border border-border object-cover"
						/>
					{:else}
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
							aria-hidden="true"
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
				<ChevronUp
					class="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:text-text {sidebarProfileOpen
						? ''
						: 'rotate-180'}"
					aria-hidden="true"
				/>
			</button>
		</div>
	</div>
</aside>
