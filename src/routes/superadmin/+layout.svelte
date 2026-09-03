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

{#if authStore.user}
	<div class="relative flex min-h-screen flex-col bg-bg text-text">
		<!-- Top Super Admin Header -->
		<header class="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
			<div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
				<div class="flex items-center gap-4">
					<a href={resolve('/superadmin')} class="flex items-center gap-2.5">
						<div
							class="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-500/20"
						>
							<span class="text-base">👑</span>
						</div>
						<div>
							<div class="flex items-center gap-2">
								<span class="font-display text-base font-black tracking-tight text-text">
									Super Admin
								</span>
								<span
									class="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-violet-500 uppercase"
								>
									Root Console
								</span>
							</div>
						</div>
					</a>

					<!-- Desktop Navigation Tabs -->
					<nav class="ml-6 hidden items-center gap-1.5 md:flex">
						{#each navItems as item (item.href)}
							{@const active =
								currentPath === item.href ||
								(item.href !== '/superadmin' && currentPath.startsWith(item.href))}
							<a
								href={resolve(item.href as '/app')}
								class="rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-180 {active
									? 'bg-primary/15 text-primary'
									: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</div>

				<div class="flex items-center gap-3">
					<a
						href={resolve('/app')}
						class="hidden items-center gap-1.5 rounded-xl border border-border bg-surface-muted px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:bg-border/40 hover:text-text sm:flex"
					>
						<span>← Back to App</span>
					</a>

					<ThemeSwitcher />

					<div
						class="flex items-center gap-2 rounded-full border border-border bg-surface-muted p-1 pr-3"
					>
						{#if authStore.user.photoURL}
							<img
								src={authStore.user.photoURL}
								alt="User profile"
								class="h-7 w-7 rounded-full object-cover"
							/>
						{:else}
							<div
								class="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white"
							>
								{userInitials}
							</div>
						{/if}
						<span class="hidden max-w-30 truncate text-xs font-bold text-text sm:inline">
							{authStore.user.displayName || authStore.user.email}
						</span>
					</div>
				</div>
			</div>

			<!-- Mobile Navigation Bar -->
			<div class="flex border-t border-border/50 px-4 py-2 md:hidden">
				{#each navItems as item (item.href)}
					{@const active =
						currentPath === item.href ||
						(item.href !== '/superadmin' && currentPath.startsWith(item.href))}
					<a
						href={resolve(item.href as '/app')}
						class="flex-1 py-1.5 text-center text-xs font-bold transition-colors {active
							? 'text-primary'
							: 'text-text-muted'}"
					>
						{item.label}
					</a>
				{/each}
			</div>
		</header>

		<!-- Main Content Body -->
		<main class="mx-auto flex w-full max-w-7xl grow flex-col p-6 sm:p-8">
			{@render children()}
		</main>

		<Toast />
	</div>
{:else if authStore.timedOut}
	<div class="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-text">
		<div
			class="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-xl"
		>
			<div
				class="bg-warning-soft text-warning mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-7 w-7"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>

			<h2 class="font-display text-xl font-bold text-text">Connection Timeout</h2>
			<p class="mt-2 text-sm leading-relaxed text-text-muted">
				Verifying your administrative session took longer than expected due to a slow or unstable
				network connection.
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
					href={resolve('/?redirect=/superadmin')}
					class="flex flex-1 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs font-bold text-text-muted transition-colors hover:text-text"
				>
					Sign In Screen
				</a>
			</div>
		</div>
	</div>
{:else}
	<div class="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-text">
		<div class="relative flex h-12 w-12 items-center justify-center">
			<div class="absolute h-full w-full rounded-full border-4 border-violet-500/20"></div>
			<div
				class="absolute h-full w-full animate-spin rounded-full border-4 border-violet-500 border-t-transparent"
			></div>
		</div>
		<p class="mt-6 animate-pulse text-xs font-bold tracking-widest text-text-muted uppercase">
			Verifying administrative permissions...
		</p>
	</div>
{/if}
