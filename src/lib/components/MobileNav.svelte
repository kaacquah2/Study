<script lang="ts">
	import type { Component } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import {
		X,
		Sparkles,
		Settings,
		LogOut,
		LayoutDashboard,
		BrainCircuit,
		Network,
		BookOpen
	} from '@lucide/svelte';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: Component }>;
		mobileMenuOpen: boolean;
		onCloseMenu: () => void;
	}

	let { currentPath, navItems, mobileMenuOpen, onCloseMenu }: Props = $props();
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && mobileMenuOpen) {
			onCloseMenu();
		}
	}}
/>

<!-- Mobile Sliding Drawer -->
{#if mobileMenuOpen}
	<div class="fixed inset-0 z-40 flex md:hidden">
		<button
			type="button"
			aria-label="Close navigation menu backdrop"
			class="fixed inset-0 border-none bg-black/50 backdrop-blur-xs"
			onclick={onCloseMenu}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Mobile navigation menu"
			class="relative z-50 flex w-72 flex-col justify-between bg-surface p-6 shadow-2xl"
		>
			<div class="flex flex-col gap-6">
				<div class="flex items-center justify-between">
					<span class="font-display text-base font-bold text-text">Navigation</span>
					<button
						type="button"
						onclick={onCloseMenu}
						class="flex cursor-pointer items-center justify-center p-2 text-text-muted hover:text-text"
						aria-label="Close navigation menu"
					>
						<X class="h-5 w-5" aria-hidden="true" />
					</button>
				</div>

				<nav class="flex flex-col gap-2">
					<!-- Prominent AI Tutor Button -->
					<button
						type="button"
						onclick={() => {
							onCloseMenu();
							chatStore.toggle();
						}}
						aria-label="Open AI Study Tutor"
						class="flex cursor-pointer items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/50 px-4 py-3 text-xs font-bold text-primary"
					>
						<Sparkles class="h-4 w-4" aria-hidden="true" />
						<span>AI Study Tutor</span>
					</button>

					{#each navItems as item (item.href)}
						{@const active =
							currentPath === item.href ||
							(item.href !== '/app' && currentPath.startsWith(item.href))}
						{@const Icon = item.icon}
						<a
							href={item.href}
							onclick={onCloseMenu}
							aria-current={active ? 'page' : undefined}
							class="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all {active
								? 'bg-primary text-white'
								: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
						>
							<Icon class="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
							<span>{item.label}</span>
						</a>
					{/each}
					<a
						href="/app/settings"
						onclick={onCloseMenu}
						aria-current={currentPath === '/app/settings' ? 'page' : undefined}
						class="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold text-text-muted hover:bg-surface-muted hover:text-text"
					>
						<Settings class="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
						<span>Profile & Settings</span>
					</a>
				</nav>
			</div>

			<button
				type="button"
				onclick={() => {
					onCloseMenu();
					authStore.logout();
				}}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger-soft py-3 text-xs font-bold text-danger"
			>
				<LogOut class="h-4 w-4" aria-hidden="true" />
				<span>Log out</span>
			</button>
		</div>
	</div>
{/if}

<!-- 5-Item Focused Bottom Navigation Bar for Mobile -->
<nav
	class="sticky bottom-0 z-30 flex items-center justify-around border-t border-border bg-surface/95 px-2 py-2.5 shadow-lg backdrop-blur-md md:hidden"
	aria-label="Mobile Bottom Navigation"
>
	<!-- 1. Home / Dashboard -->
	<a
		href="/app"
		aria-current={currentPath === '/app' ? 'page' : undefined}
		class="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors {currentPath ===
		'/app'
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<LayoutDashboard class="h-5 w-5" aria-hidden="true" />
		<span>Home</span>
	</a>

	<!-- 2. Practice & Review -->
	<a
		href="/app/review"
		aria-current={currentPath.startsWith('/app/review') ? 'page' : undefined}
		class="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors {currentPath.startsWith(
			'/app/review'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<BrainCircuit class="h-5 w-5" aria-hidden="true" />
		<span>Practice</span>
	</a>

	<!-- 3. AI Tutor (Center Action Button) -->
	<button
		type="button"
		onclick={() => chatStore.toggle()}
		aria-label="Toggle AI Tutor"
		class="flex min-h-11 min-w-14 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10px] font-black text-primary transition-transform active:scale-95"
	>
		<div
			class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-primary/30 shadow-md"
			aria-hidden="true"
		>
			<Sparkles class="h-3.5 w-3.5" />
		</div>
		<span class="font-extrabold text-primary">Tutor</span>
	</button>

	<!-- 4. Knowledge Map -->
	<a
		href="/app/knowledge-map"
		aria-current={currentPath.startsWith('/app/knowledge-map') ? 'page' : undefined}
		class="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors {currentPath.startsWith(
			'/app/knowledge-map'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<Network class="h-5 w-5" aria-hidden="true" />
		<span>Map</span>
	</a>

	<!-- 5. Study Library -->
	<a
		href="/app/knowledge"
		aria-current={currentPath.startsWith('/app/knowledge') ? 'page' : undefined}
		class="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors {currentPath.startsWith(
			'/app/knowledge'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<BookOpen class="h-5 w-5" aria-hidden="true" />
		<span>Library</span>
	</a>
</nav>
