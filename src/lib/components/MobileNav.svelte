<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { resolve } from '$app/paths';

	interface Props {
		currentPath: string;
		navItems: Array<{ label: string; href: string; icon: string }>;
		mobileMenuOpen: boolean;
		onCloseMenu: () => void;
	}

	let { currentPath, navItems, mobileMenuOpen, onCloseMenu }: Props = $props();
</script>

<!-- Mobile Sliding Drawer -->
{#if mobileMenuOpen}
	<div class="fixed inset-0 z-40 flex md:hidden">
		<button
			type="button"
			aria-label="Close menu backdrop"
			class="fixed inset-0 border-none bg-black/50 backdrop-blur-xs"
			onclick={onCloseMenu}
		></button>
		<div class="relative z-50 flex w-72 flex-col justify-between bg-surface p-6 shadow-2xl">
			<div class="flex flex-col gap-6">
				<div class="flex items-center justify-between">
					<span class="font-display text-base font-bold text-text">Navigation</span>
					<button type="button" onclick={onCloseMenu} class="text-text-muted hover:text-text">
						&times;
					</button>
				</div>

				<nav class="flex flex-col gap-2">
					{#each navItems as item (item.href)}
						{@const active =
							currentPath === item.href ||
							(item.href !== '/app' && currentPath.startsWith(item.href))}
						<a
							href={resolve(item.href as '/app')}
							onclick={onCloseMenu}
							class="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all {active
								? 'bg-primary text-white'
								: 'text-text-muted hover:bg-surface-muted hover:text-text'}"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4.5 w-4.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
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
						href={resolve('/app/settings' as '/app')}
						onclick={onCloseMenu}
						class="flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold text-text-muted hover:bg-surface-muted hover:text-text"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4.5 w-4.5"
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
				Log out
			</button>
		</div>
	</div>
{/if}

<!-- Bottom Navigation Bar for Mobile -->
<nav
	class="sticky bottom-0 z-30 flex justify-around border-t border-border bg-surface px-4 py-3 shadow-lg md:hidden"
>
	{#each navItems as item (item.href)}
		{@const active =
			currentPath === item.href || (item.href !== '/app' && currentPath.startsWith(item.href))}
		<a
			href={resolve(item.href as '/app')}
			class="flex flex-col items-center gap-1 text-[10px] font-bold transition-colors {active
				? 'text-primary'
				: 'text-text-muted hover:text-text'}"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
			</svg>
			<span>{item.label.replace('+ ', '')}</span>
		</a>
	{/each}
</nav>
