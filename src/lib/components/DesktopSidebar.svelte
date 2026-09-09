<script lang="ts">
	import type { Component } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { page } from '$app/state';
	import {
		BookOpen,
		Sparkles,
		Settings,
		Flame,
		LogOut,
		ChevronUp,
		ShieldCheck,
		GraduationCap
	} from '@lucide/svelte';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: Component }>;
	}

	let { currentPath, navItems }: Props = $props();

	let sidebarProfileOpen = $state(false);
	let profileContainer: HTMLDivElement | null = $state(null);

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
		'/app/admin': 'Administration',
		'/app/settings': 'System'
	};

	let isItemActive = $derived((href: string) => {
		if (currentPath.startsWith('/app/admin')) {
			const currentTab = page.url.searchParams.get('tab') || 'overview';
			if (href === '/app/admin') return currentTab === 'overview';
			if (href === '/app/admin?tab=users') return currentTab === 'users' || currentTab === 'students';
			if (href === '/app/admin?tab=system') return currentTab === 'system';
			return currentPath === href;
		}
		return currentPath === href || (href !== '/app' && currentPath.startsWith(href));
	});
</script>

<svelte:window
	onclick={(e) => {
		if (sidebarProfileOpen && profileContainer && !profileContainer.contains(e.target as Node)) {
			sidebarProfileOpen = false;
		}
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && sidebarProfileOpen) {
			sidebarProfileOpen = false;
		}
	}}
/>

<aside
	class="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col justify-between border-r select-none md:flex xl:w-64"
	style="background: var(--surface); border-color: var(--border); box-shadow: 1px 0 0 0 var(--border);"
>
	<!-- Fixed Header Zone (Logo / Branding) -->
	<div class="flex shrink-0 items-center justify-between border-b border-border/60 p-4 xl:p-5">
		{#if currentPath.startsWith('/app/admin')}
			<a href="/app/admin" class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-violet-700 text-white shadow-md shadow-violet-500/20"
				>
					<ShieldCheck class="h-5 w-5" aria-hidden="true" />
				</div>
				<div class="min-w-0">
					<span
						class="block truncate font-display text-sm font-bold tracking-tight text-text xl:text-base"
						>Admin Console</span
					>
					<span class="block truncate text-[10px] font-semibold text-primary"
						>System Command Center</span
					>
				</div>
			</a>
		{:else}
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
		{/if}
	</div>

	<!-- Scrollable Middle Zone (Quick action + Nav list + Heatmap) -->
	<div
		class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3 space-y-3.5 scrollbar-thin xl:px-4"
	>
		{#if currentPath.startsWith('/app/admin')}
			<!-- Quick Switch to Learner Mode -->
			<a
				href="/app"
				class="flex w-full items-center justify-between gap-2.5 rounded-xl border border-border bg-surface-muted/90 px-3 py-2 text-xs font-semibold text-text transition-all duration-200 hover:border-primary/40 hover:bg-primary-soft hover:text-primary xl:px-3.5 xl:py-2.5"
			>
				<div class="flex items-center gap-2 truncate">
					<GraduationCap class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
					<span class="truncate">Switch to Student View</span>
				</div>
				<span class="text-[11px] text-text-muted">Exit ↗</span>
			</a>
		{:else}
			<!-- AI Study Tutor Prominent Quick Action -->
			<button
				type="button"
				onclick={() => chatStore.toggle()}
				class="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 xl:px-3.5 xl:py-2.5"
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
		{/if}

		<!-- Navigation Items -->
		<nav class="flex flex-col gap-1">
			{#each navItems as item (item.href)}
				{#if sectionBreaks[item.href] && !currentPath.startsWith('/app/admin')}
					<div class="mt-2.5 mb-1 flex items-center gap-2 px-2.5">
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
				{@const active = isItemActive(item.href)}
				{@const Icon = item.icon}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 xl:px-3.5 xl:py-2"
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
							class="absolute top-1/2 left-0 h-4 w-1 -translate-y-1/2 rounded-r-full"
							style="background: var(--primary);"
						></span>
					{/if}
					<Icon class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{item.label}</span>
				</a>
			{/each}
		</nav>

		<!-- Heatmap or Admin Info Card -->
		<div class="pt-1">
			{#if currentPath.startsWith('/app/admin')}
				<div class="rounded-xl border border-border/70 bg-surface-muted/60 p-3 text-center">
					<div class="mb-1 flex items-center justify-center text-primary">
						<ShieldCheck class="h-5 w-5" />
					</div>
					<div class="text-[11px] font-bold text-text">Root Platform Access</div>
					<div class="mt-0.5 text-[10px] text-text-muted">Full administrative privileges active.</div>
				</div>
			{:else}
				<StreakHeatmap />
			{/if}
		</div>
	</div>

	<!-- Fixed Bottom Zone (Theme Switcher + Profile Menu) - Always Visible -->
	<div
		bind:this={profileContainer}
		class="relative flex shrink-0 flex-col gap-2.5 border-t border-border/80 bg-surface p-3 xl:p-3.5"
	>
		<!-- Full-width Theme Switcher Row -->
		<div class="flex flex-col gap-1.5 px-0.5">
			<div
				class="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase text-text-muted"
			>
				<span>Theme</span>
				<span class="font-medium text-text-subtle capitalize">{themeStore.current} Mode</span>
			</div>
			<ThemeSwitcher fullWidth={true} />
		</div>

		<!-- User Profile Section -->
		<div class="relative border-t border-border/60 pt-1.5">
			{#if sidebarProfileOpen}
				<div
					role="menu"
					aria-label="User profile options"
					class="absolute bottom-full left-0 z-50 mb-2.5 flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl transition-all duration-180"
				>
					<div class="flex items-center gap-3 border-b border-border/60 pb-3">
						<Avatar
							src={authStore.user?.photoURL}
							name={authStore.user?.displayName || authStore.profile?.displayName || authStore.user?.email}
							size="lg"
						/>
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

						{#if isAdmin}
							<a
								href="/app/admin"
								role="menuitem"
								onclick={() => (sidebarProfileOpen = false)}
								class="flex items-center gap-2.5 rounded-xl bg-primary-soft/80 px-3 py-2 font-bold text-primary transition-colors hover:bg-primary-soft"
							>
								<ShieldCheck class="h-4 w-4 shrink-0" aria-hidden="true" />
								<span>Admin Console</span>
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
					<Avatar
						src={authStore.user?.photoURL}
						name={authStore.user?.displayName || authStore.user?.email}
						size="md"
					/>
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
