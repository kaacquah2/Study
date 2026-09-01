<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import Toast from '$lib/components/Toast.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let currentPath = $derived(page.url.pathname);

	$effect(() => {
		if (authStore.authResolved && !authStore.user) {
			goto(resolve('/?redirect=/superadmin'));
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
		return 'SA';
	});

	const navItems = [
		{ label: 'Overview', href: '/superadmin' },
		{ label: 'User Management', href: '/superadmin/user-management' },
		{ label: 'System Analytics', href: '/app/admin' }
	];
</script>

<div class="relative flex min-h-screen flex-col bg-bg text-text">
	<!-- Top Super Admin Header -->
	<header class="top-0 backdrop-blur-md sticky z-40 border-b border-border bg-surface/90">
		<div class="max-w-7xl px-6 py-3.5 mx-auto flex items-center justify-between">
			<div class="gap-4 flex items-center">
				<a href={resolve('/superadmin')} class="gap-2.5 flex items-center">
					<div
						class="h-9 w-9 from-violet-600 to-indigo-700 text-white shadow-violet-500/20 flex items-center justify-center rounded-xl bg-linear-to-br shadow-md"
					>
						<span class="text-base">👑</span>
					</div>
					<div>
						<div class="gap-2 flex items-center">
							<span class="font-display text-base font-black tracking-tight text-text">
								Super Admin
							</span>
							<span
								class="border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-extrabold tracking-wider text-violet-500 rounded-md border text-[10px] uppercase"
							>
								Root Console
							</span>
						</div>
					</div>
				</a>

				<!-- Desktop Navigation Tabs -->
				<nav class="ml-6 gap-1.5 md:flex hidden items-center">
					{#each navItems as item (item.href)}
						{@const active =
							currentPath === item.href ||
							(item.href !== '/superadmin' && currentPath.startsWith(item.href))}
						<a
							href={resolve(item.href as '/app')}
							class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all duration-180 {active
								? 'bg-primary/15 text-primary'
								: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
						>
							{item.label}
						</a>
					{/each}
				</nav>
			</div>

			<div class="gap-3 flex items-center">
				<a
					href={resolve('/app')}
					class="gap-1.5 px-3 py-1.5 text-xs font-bold sm:flex hidden items-center rounded-xl border border-border bg-surface-muted text-text-muted transition-colors hover:bg-border/40 hover:text-text"
				>
					<span>← Back to App</span>
				</a>

				<ThemeSwitcher />

				{#if authStore.user}
					<div
						class="gap-2 p-1 pr-3 flex items-center rounded-full border border-border bg-surface-muted"
					>
						{#if authStore.user.photoURL}
							<img
								src={authStore.user.photoURL}
								alt="User profile"
								class="h-7 w-7 rounded-full object-cover"
							/>
						{:else}
							<div
								class="h-7 w-7 bg-violet-600 text-xs font-bold text-white flex items-center justify-center rounded-full"
							>
								{userInitials}
							</div>
						{/if}
						<span class="max-w-30 text-xs font-bold sm:inline hidden truncate text-text">
							{authStore.user.displayName || authStore.user.email}
						</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Mobile Navigation Bar -->
		<div class="px-4 py-2 md:hidden flex border-t border-border/50">
			{#each navItems as item (item.href)}
				{@const active =
					currentPath === item.href ||
					(item.href !== '/superadmin' && currentPath.startsWith(item.href))}
				<a
					href={resolve(item.href as '/app')}
					class="py-1.5 text-xs font-bold flex-1 text-center transition-colors {active
						? 'text-primary'
						: 'text-text-muted'}"
				>
					{item.label}
				</a>
			{/each}
		</div>
	</header>

	<!-- Main Content Body -->
	<main class="max-w-7xl p-6 sm:p-8 mx-auto flex w-full grow flex-col">
		{@render children()}
	</main>

	<Toast />
</div>
