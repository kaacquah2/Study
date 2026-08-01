<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import StreakChip from '$lib/components/StreakChip.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import AssistantChat from '$lib/components/AssistantChat.svelte';
	import DesktopSidebar from '$lib/components/DesktopSidebar.svelte';
	import MobileNav from '$lib/components/MobileNav.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let mobileMenuOpen = $state(false);
	let userMenuOpen = $state(false);
	let currentPath = $derived(page.url.pathname);

	// Protect all /app/* routes
	$effect(() => {
		if (authStore.authResolved && !authStore.user) {
			const currentUrl = page.url.pathname + page.url.search;
			goto(`/?redirect=${encodeURIComponent(currentUrl)}`);
		}
	});

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

	let pageBreadcrumb = $derived.by(() => {
		if (currentPath === '/app') return { parent: 'Workspace', current: 'Dashboard' };
		if (currentPath.includes('/courses/createCourse'))
			return { parent: 'Dashboard', current: 'Create New Course' };
		if (currentPath.includes('/explore'))
			return { parent: 'Dashboard', current: 'Explore Courses' };
		if (currentPath.includes('/settings'))
			return { parent: 'Workspace', current: 'Profile & Settings' };
		if (currentPath.includes('/knowledge'))
			return { parent: 'Workspace', current: 'Knowledge Base' };
		if (currentPath.includes('/courses/'))
			return { parent: 'Dashboard', current: 'Course Workspace' };
		return { parent: 'Workspace', current: 'Dashboard' };
	});

	const navItems = [
		{
			label: 'Dashboard',
			href: '/app',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{ label: '+ Create New Course', href: '/app/courses/createCourse', icon: 'M12 4v16m8-8H4' },
		{ label: 'Explore', href: '/app/explore', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
		{
			label: 'Knowledge & Summarizer',
			href: '/app/knowledge',
			icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4'
		},
		{
			label: 'SRS Memory Review',
			href: '/app/review',
			icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-4a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
		},
		{
			label: 'Study Groups',
			href: '/app/study-groups',
			icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5 5 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
		}
	];

</script>

<div
	class="relative flex min-h-screen bg-bg text-text selection:bg-primary-soft selection:text-primary"
>
	<!-- Popover Overlay -->
	{#if userMenuOpen}
		<button
			type="button"
			aria-label="Close popover menu"
			class="fixed inset-0 z-40 cursor-default border-none bg-transparent"
			onclick={() => {
				userMenuOpen = false;
			}}
		></button>
	{/if}

	<DesktopSidebar {currentPath} {navItems} />

	<!-- Main Content Area -->
	<div class="flex min-w-0 grow flex-col">
		<!-- Header -->
		<header
			class="relative z-30 flex items-center justify-between border-b border-border bg-surface px-6 py-4"
		>
			<div class="flex items-center gap-3 md:hidden">
				<button
					type="button"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-label="Toggle menu"
					class="cursor-pointer rounded-xl border border-border p-2 text-text-muted hover:text-text"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
				</button>
				<span class="font-display text-sm font-bold text-text">AI Study Buddy</span>
			</div>

			<div
				class="hidden items-center gap-2 rounded-full border border-border/80 bg-surface-muted/60 px-3.5 py-1.5 text-xs font-semibold text-text-muted shadow-2xs md:flex"
			>
				<span class="flex items-center gap-1.5 text-primary">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 14l9-5-9-5-9 5 9 5z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
						/>
					</svg>
					<a href="/app" class="transition-colors hover:underline"
						>{pageBreadcrumb.parent}</a
					>
				</span>
				<span class="text-text-muted/40">/</span>
				<span class="font-bold text-text">{pageBreadcrumb.current}</span>
			</div>

			<div class="relative z-40 flex items-center gap-3">
				<StreakChip />

				{#if authStore.user}
					<div class="relative">
						<button
							type="button"
							onclick={() => (userMenuOpen = !userMenuOpen)}
							class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-muted transition-all duration-180 hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							aria-label="User account menu"
							aria-expanded={userMenuOpen}
						>
							{#if authStore.user.photoURL}
								<img
									src={authStore.user.photoURL}
									alt={authStore.user.displayName || 'User'}
									class="h-8 w-8 rounded-full object-cover"
								/>
							{:else}
								<div
									class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
								>
									{userInitials}
								</div>
							{/if}
						</button>

						{#if userMenuOpen}
							<div
								class="absolute top-full right-0 z-50 mt-2 flex w-64 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xl"
							>
								<div class="flex items-center gap-3 border-b border-border/60 pb-3">
									{#if authStore.user.photoURL}
										<img
											src={authStore.user.photoURL}
											alt={authStore.user.displayName || 'User'}
											class="h-10 w-10 rounded-full border border-border object-cover"
										/>
									{:else}
										<div
											class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
										>
											{userInitials}
										</div>
									{/if}
									<div class="truncate">
										<span class="block truncate text-xs font-bold text-text">
											{authStore.user.displayName || 'Student'}
										</span>
										<span class="block truncate text-[11px] text-text-muted">
											{authStore.user.email}
										</span>
									</div>
								</div>

								<div class="flex flex-col gap-1 text-xs font-semibold">
									<a
										href="/app"
										onclick={() => (userMenuOpen = false)}
										class="flex items-center gap-2 rounded-xl px-3 py-2 text-text hover:bg-surface-muted"
									>
										<span>📊</span>
										<span>Dashboard</span>
									</a>
									<a
										href="/app/explore"
										onclick={() => (userMenuOpen = false)}
										class="flex items-center gap-2 rounded-xl px-3 py-2 text-text hover:bg-surface-muted"
									>
										<span>🔍</span>
										<span>Explore Courses</span>
									</a>
									{#if authStore.profile?.role === 'superadmin' || authStore.profile?.isSuperAdmin || authStore.profile?.role === 'admin' || authStore.profile?.isAdmin}
										<a
											href="/superadmin"
											onclick={() => (userMenuOpen = false)}
											class="flex items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2 font-bold text-violet-500 hover:bg-violet-500/20"
										>
											<span>👑</span>
											<span>Super Admin Console</span>
										</a>
									{/if}
									<a
										href="/app/settings"
										onclick={() => (userMenuOpen = false)}
										class="flex items-center gap-2 rounded-xl px-3 py-2 text-text hover:bg-surface-muted"
									>
										<span>⚙️</span>
										<span>Profile & Settings</span>
									</a>
								</div>

								<div class="flex items-center justify-between border-t border-border/60 pt-2">
									<span class="text-xs font-bold text-text-muted">Theme</span>
									<ThemeSwitcher />
								</div>

								<button
									type="button"
									onclick={() => {
										userMenuOpen = false;
										authStore.logout();
									}}
									class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger-soft py-2.5 text-xs font-bold text-danger transition-colors hover:bg-danger/15"
								>
									<span>Log out</span>
								</button>
							</div>
						{/if}
					</div>
				{/if}

				<div class="md:hidden">
					<ThemeSwitcher />
				</div>
			</div>
		</header>

		<MobileNav
			{currentPath}
			{navItems}
			{mobileMenuOpen}
			onCloseMenu={() => (mobileMenuOpen = false)}
		/>

		<!-- Body View Render -->
		<main class="mx-auto flex w-full max-w-7xl grow flex-col p-6 sm:p-8">
			{@render children()}
		</main>
	</div>

	<Toast />
	<AssistantChat />
</div>
