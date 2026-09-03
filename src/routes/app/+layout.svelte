<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import StreakChip from '$lib/components/StreakChip.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import AssistantChat from '$lib/components/AssistantChat.svelte';
	import DesktopSidebar from '$lib/components/DesktopSidebar.svelte';
	import MobileNav from '$lib/components/MobileNav.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { focusTrap } from '$lib/utils/focusTrap';
	import {
		LayoutDashboard,
		PlusCircle,
		Compass,
		Network,
		BookOpen,
		BrainCircuit,
		AlertCircle,
		Users,
		Menu,
		GraduationCap,
		Crown,
		Settings,
		LogOut,
		TriangleAlert,
		ShieldCheck
	} from '@lucide/svelte';

	// View Transitions API — smooth cross-page animations (respects prefers-reduced-motion)
	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let mobileMenuOpen = $state(false);
	let userMenuOpen = $state(false);
	let userMenuContainer = $state<HTMLElement | null>(null);
	let userMenuTrigger = $state<HTMLButtonElement | null>(null);

	function closeUserMenu(restoreFocus = true) {
		userMenuOpen = false;
		if (restoreFocus && userMenuTrigger) {
			userMenuTrigger.focus();
		}
	}

	function handleWindowClick(event: MouseEvent) {
		if (!userMenuOpen) return;
		const target = event.target as Node;
		if (
			userMenuContainer &&
			!userMenuContainer.contains(target) &&
			userMenuTrigger &&
			!userMenuTrigger.contains(target)
		) {
			closeUserMenu(false);
		}
	}

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
		if (currentPath.includes('/review'))
			return { parent: 'Workspace', current: 'Practice & Review' };
		if (currentPath.includes('/mistakes')) return { parent: 'Workspace', current: 'Mistake Bank' };
		if (currentPath.includes('/study-groups'))
			return { parent: 'Workspace', current: 'Study Groups' };
		if (currentPath.includes('/settings'))
			return { parent: 'Workspace', current: 'Profile & Settings' };
		if (currentPath.includes('/knowledge-map'))
			return { parent: 'Workspace', current: 'Knowledge Map' };
		if (currentPath.includes('/knowledge'))
			return { parent: 'Workspace', current: 'Knowledge Base' };
		if (currentPath.includes('/admin')) return { parent: 'Workspace', current: 'System Analytics' };
		if (currentPath.includes('/courses/'))
			return { parent: 'Dashboard', current: 'Course Workspace' };
		return { parent: 'Workspace', current: 'Dashboard' };
	});

	let isAdmin = $derived(
		Boolean(
			authStore.profile?.role === 'admin' ||
			authStore.profile?.isAdmin ||
			authStore.profile?.role === 'superadmin' ||
			authStore.profile?.isSuperAdmin
		)
	);

	let isSuperAdmin = $derived(
		Boolean(authStore.profile?.role === 'superadmin' || authStore.profile?.isSuperAdmin)
	);

	let navItems = $derived.by(() => {
		const items = [
			{
				label: 'Dashboard',
				href: '/app',
				icon: LayoutDashboard
			},
			{ label: 'New Course', href: '/app/courses/createCourse', icon: PlusCircle },
			{ label: 'Explore', href: '/app/explore', icon: Compass },
			{
				label: 'Knowledge Map',
				href: '/app/knowledge-map',
				icon: Network
			},
			{
				label: 'Study Library',
				href: '/app/knowledge',
				icon: BookOpen
			},
			{
				label: 'Practice & Review',
				href: '/app/review',
				icon: BrainCircuit
			},
			{
				label: 'Mistake Bank',
				href: '/app/mistakes',
				icon: AlertCircle
			},
			{
				label: 'Study Groups',
				href: '/app/study-groups',
				icon: Users
			}
		];
		if (isAdmin) {
			items.push({
				label: 'System Analytics',
				href: '/app/admin',
				icon: ShieldCheck
			});
		}
		return items;
	});
</script>

<svelte:window
	onclick={handleWindowClick}
	onkeydown={(e) => {
		if (e.key === 'Escape' && userMenuOpen) {
			closeUserMenu(true);
		}
	}}
/>

{#if authStore.user}
	<div
		class="relative flex min-h-screen bg-bg text-text selection:bg-primary-soft selection:text-primary"
	>
		<!-- Keyboard Skip to Content Navigation -->
		<a href="#main-content" class="skip-link">Skip to main content</a>

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
						class="flex cursor-pointer items-center justify-center rounded-xl border border-border p-2 text-text-muted hover:text-text"
					>
						<Menu class="h-5 w-5" aria-hidden="true" />
					</button>
					<span class="font-display text-sm font-bold text-text">AI Study Buddy</span>
				</div>

				<div
					class="hidden items-center gap-2 rounded-full border border-border/80 bg-surface-muted/60 px-3.5 py-1.5 text-xs font-semibold text-text-muted shadow-2xs md:flex"
				>
					<span class="flex items-center gap-1.5 text-primary">
						<GraduationCap class="h-4 w-4" aria-hidden="true" />
						<a href="/app" class="transition-colors hover:underline">{pageBreadcrumb.parent}</a>
					</span>
					<span class="text-text-muted/40">/</span>
					<span class="font-bold text-text">{pageBreadcrumb.current}</span>
				</div>

				<div class="relative z-40 flex items-center gap-3">
					<StreakChip />

					<div class="relative">
						<button
							bind:this={userMenuTrigger}
							type="button"
							onclick={() => (userMenuOpen ? closeUserMenu(false) : (userMenuOpen = true))}
							class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-muted transition-all duration-180 hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							aria-label="User account menu"
							aria-haspopup="menu"
							aria-expanded={userMenuOpen}
							aria-controls="user-account-menu"
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
								bind:this={userMenuContainer}
								id="user-account-menu"
								role="menu"
								aria-label="User account options"
								use:focusTrap={{
									onEscape: () => closeUserMenu(true),
									restoreFocus: true
								}}
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
										role="menuitem"
										href="/app"
										onclick={() => closeUserMenu(false)}
										class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
									>
										<LayoutDashboard class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
										<span>Dashboard</span>
									</a>
									<a
										role="menuitem"
										href="/app/explore"
										onclick={() => closeUserMenu(false)}
										class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
									>
										<Compass class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
										<span>Explore Courses</span>
									</a>
									{#if isSuperAdmin}
										<a
											role="menuitem"
											href="/superadmin"
											onclick={() => closeUserMenu(false)}
											class="flex items-center gap-2.5 rounded-xl bg-violet-500/10 px-3 py-2 font-bold text-violet-500 hover:bg-violet-500/20 focus:bg-violet-500/20 focus:outline-none"
										>
											<Crown class="h-4 w-4 shrink-0" aria-hidden="true" />
											<span>Super Admin Console</span>
										</a>
									{/if}
									{#if isAdmin}
										<a
											role="menuitem"
											href="/app/admin"
											onclick={() => closeUserMenu(false)}
											class="flex items-center gap-2.5 rounded-xl bg-primary-soft/60 px-3 py-2 font-bold text-primary hover:bg-primary-soft focus:bg-primary-soft focus:outline-none"
										>
											<ShieldCheck class="h-4 w-4 shrink-0" aria-hidden="true" />
											<span>Admin Dashboard</span>
										</a>
									{/if}
									<a
										role="menuitem"
										href="/app/settings"
										onclick={() => closeUserMenu(false)}
										class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
									>
										<Settings class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
										<span>Profile & Settings</span>
									</a>
								</div>

								<div class="flex items-center justify-between border-t border-border/60 pt-2">
									<span class="text-xs font-bold text-text-muted">Theme</span>
									<ThemeSwitcher />
								</div>

								<button
									role="menuitem"
									type="button"
									onclick={() => {
										closeUserMenu(false);
										authStore.logout();
									}}
									class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger-soft py-2.5 text-xs font-bold text-danger transition-colors hover:bg-danger/15 focus:bg-danger/15 focus:outline-none"
								>
									<LogOut class="h-4 w-4" aria-hidden="true" />
									<span>Log out</span>
								</button>
							</div>
						{/if}
					</div>

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
			<div class="flex min-h-0 grow overflow-hidden">
				<main
					id="main-content"
					tabindex="-1"
					class="mx-auto flex w-full max-w-7xl grow flex-col overflow-y-auto px-4 py-5 focus:outline-none sm:px-6 sm:py-6 lg:px-8"
				>
					{@render children()}
				</main>
				<div
					class={chatStore.isDocked && chatStore.isOpen
						? 'relative z-20 flex h-full shrink-0'
						: 'contents'}
				>
					<AssistantChat />
				</div>
			</div>
		</div>

		<Toast />
	</div>
{:else if authStore.timedOut}
	<!-- Session Timeout / Slow Connection State -->
	<div class="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-text">
		<div
			class="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-xl"
		>
			<div
				class="bg-warning-soft text-warning mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
			>
				<TriangleAlert class="h-7 w-7" aria-hidden="true" />
			</div>

			<h2 class="font-display text-xl font-bold text-text">Connection Timeout</h2>
			<p class="mt-2 text-sm leading-relaxed text-text-muted">
				Verifying your session is taking longer than expected due to a slow or unstable network
				connection. You have not been signed out.
			</p>

			<div class="mt-6 flex flex-col gap-3 sm:flex-row">
				<button
					type="button"
					onclick={() => authStore.retry()}
					class="flex-1 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-180 hover:bg-primary-hover active:scale-98"
				>
					Retry Connection
				</button>
				<a
					href="/?redirect={encodeURIComponent(page.url.pathname + page.url.search)}"
					class="flex flex-1 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs font-bold text-text-muted transition-colors hover:text-text"
				>
					Sign In Screen
				</a>
			</div>
		</div>
	</div>
{:else}
	<!-- Session Loading State -->
	<div class="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-text">
		<div class="relative flex h-12 w-12 items-center justify-center">
			<div class="absolute h-full w-full rounded-full border-4 border-primary/20"></div>
			<div
				class="absolute h-full w-full animate-spin rounded-full border-4 border-primary border-t-transparent"
			></div>
		</div>
		<p class="mt-6 animate-pulse text-xs font-bold tracking-widest text-text-muted uppercase">
			Securing session...
		</p>
	</div>
{/if}
