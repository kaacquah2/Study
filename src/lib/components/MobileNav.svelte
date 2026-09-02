<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: string }>;
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
	<div class="inset-0 md:hidden fixed z-40 flex">
		<button
			type="button"
			aria-label="Close navigation menu backdrop"
			class="inset-0 bg-black/50 backdrop-blur-xs fixed border-none"
			onclick={onCloseMenu}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Mobile navigation menu"
			class="w-72 p-6 shadow-2xl relative z-50 flex flex-col justify-between bg-surface"
		>
			<div class="gap-6 flex flex-col">
				<div class="flex items-center justify-between">
					<span class="font-display text-base font-bold text-text">Navigation</span>
					<button
						type="button"
						onclick={onCloseMenu}
						class="p-2 cursor-pointer text-text-muted hover:text-text"
						aria-label="Close navigation menu"
					>
						&times;
					</button>
				</div>

				<nav class="gap-2 flex flex-col">
					<!-- Prominent AI Tutor Button -->
					<button
						type="button"
						onclick={() => {
							onCloseMenu();
							chatStore.toggle();
						}}
						aria-label="Open AI Study Tutor"
						class="gap-3 px-4 py-3 text-xs font-bold flex cursor-pointer items-center rounded-xl border border-primary/30 bg-primary-soft/50 text-primary"
					>
						<span aria-hidden="true">✨</span>
						<span>AI Study Tutor</span>
					</button>

					{#each navItems as item (item.href)}
						{@const active =
							currentPath === item.href ||
							(item.href !== '/app' && currentPath.startsWith(item.href))}
						<a
							href={item.href}
							onclick={onCloseMenu}
							aria-current={active ? 'page' : undefined}
							class="gap-3 px-4 py-3 text-xs font-bold flex items-center rounded-xl transition-all {active
								? 'text-white bg-primary'
								: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4.5 w-4.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d={item.icon}
								/>
							</svg>
							<span>{item.label}</span>
						</a>
					{/each}
					<a
						href="/app/settings"
						onclick={onCloseMenu}
						aria-current={currentPath === '/app/settings' ? 'page' : undefined}
						class="gap-3 px-4 py-3 text-xs font-bold flex items-center rounded-xl text-text-muted hover:bg-surface-muted hover:text-text"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4.5 w-4.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							/>
						</svg>
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
				class="gap-2 py-3 text-xs font-bold flex w-full cursor-pointer items-center justify-center rounded-xl bg-danger-soft text-danger"
			>
				Log out
			</button>
		</div>
	</div>
{/if}

<!-- 5-Item Focused Bottom Navigation Bar for Mobile -->
<nav
	class="bottom-0 px-2 py-2.5 backdrop-blur-md md:hidden sticky z-30 flex items-center justify-around border-t border-border bg-surface/95 shadow-lg"
	aria-label="Mobile Bottom Navigation"
>
	<!-- 1. Home / Dashboard -->
	<a
		href="/app"
		aria-current={currentPath === '/app' ? 'page' : undefined}
		class="min-h-11 min-w-14 gap-0.5 font-bold flex flex-col items-center justify-center text-[10px] transition-colors {currentPath ===
		'/app'
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
			/>
		</svg>
		<span>Home</span>
	</a>

	<!-- 2. Practice & Review -->
	<a
		href="/app/review"
		aria-current={currentPath.startsWith('/app/review') ? 'page' : undefined}
		class="min-h-11 min-w-14 gap-0.5 font-bold flex flex-col items-center justify-center text-[10px] transition-colors {currentPath.startsWith(
			'/app/review'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h-4a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
			/>
		</svg>
		<span>Practice</span>
	</a>

	<!-- 3. AI Tutor (Center Action Button) -->
	<button
		type="button"
		onclick={() => chatStore.toggle()}
		aria-label="Toggle AI Tutor"
		class="min-h-11 min-w-14 gap-0.5 font-black flex cursor-pointer flex-col items-center justify-center text-[10px] text-primary transition-transform active:scale-95"
	>
		<div
			class="h-7 w-7 text-white flex items-center justify-center rounded-full bg-primary shadow-md shadow-primary/30"
			aria-hidden="true"
		>
			<span class="text-xs">✨</span>
		</div>
		<span class="font-extrabold text-primary">Tutor</span>
	</button>

	<!-- 4. Knowledge Map -->
	<a
		href="/app/knowledge-map"
		aria-current={currentPath.startsWith('/app/knowledge-map') ? 'page' : undefined}
		class="min-h-11 min-w-14 gap-0.5 font-bold flex flex-col items-center justify-center text-[10px] transition-colors {currentPath.startsWith(
			'/app/knowledge-map'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
			/>
		</svg>
		<span>Map</span>
	</a>

	<!-- 5. Study Library -->
	<a
		href="/app/knowledge"
		aria-current={currentPath.startsWith('/app/knowledge') ? 'page' : undefined}
		class="min-h-11 min-w-14 gap-0.5 font-bold flex flex-col items-center justify-center text-[10px] transition-colors {currentPath.startsWith(
			'/app/knowledge'
		)
			? 'text-primary'
			: 'text-text-muted hover:text-text'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
			/>
		</svg>
		<span>Library</span>
	</a>
</nav>
