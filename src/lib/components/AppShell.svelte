<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Header from './Header.svelte';
	import AssistantChat from './AssistantChat.svelte';

	interface Props {
		children: Snippet;
		requireAuth?: boolean;
	}

	let { children, requireAuth = true }: Props = $props();
	let showTimeoutError = $state(false);

	// Run protection logic when auth state resolves
	$effect(() => {
		if (authStore.authResolved && requireAuth && !authStore.user) {
			const currentUrl = page.url.pathname + page.url.search;
			goto(`/?redirect=${encodeURIComponent(currentUrl)}`);
		}
	});

	// Timer for auth timeout fallback state
	$effect(() => {
		if (requireAuth && !authStore.authResolved) {
			const timer = setTimeout(() => {
				showTimeoutError = true;
			}, 8000);
			return () => clearTimeout(timer);
		} else {
			showTimeoutError = false;
		}
	});
</script>

<div
	class="flex min-h-screen flex-col bg-bg text-text selection:bg-primary-soft selection:text-primary"
>
	<Header />

	{#if !authStore.authResolved && !authStore.profile && requireAuth}
		<!-- Authentication loading state with theme-compliant aesthetics -->
		<div class="flex grow flex-col items-center justify-center p-6">
			{#if showTimeoutError}
				<!-- Timeout / Error State -->
				<div class="max-w-md text-center">
					<div
						class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-danger-soft text-danger"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-6 w-6"
							><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line
								x1="12"
								y1="16"
								x2="12.01"
								y2="16"
							/></svg
						>
					</div>
					<h3 class="mb-2 font-display text-base font-bold text-text">
						Session verification timeout
					</h3>
					<p class="mb-6 text-xs text-text-muted">
						We are having trouble securing your session. Please check your connection or try signing
						in again.
					</p>
					<button
						type="button"
						class="cursor-pointer rounded-md bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
						onclick={() => window.location.reload()}
					>
						Retry connection
					</button>
				</div>
			{:else}
				<div class="relative flex h-12 w-12 items-center justify-center">
					<!-- Visual loading rings -->
					<div class="absolute h-full w-full rounded-full border-4 border-primary-soft"></div>
					<div
						class="absolute h-full w-full animate-spin rounded-full border-4 border-primary border-t-transparent"
					></div>
				</div>
				<p class="mt-6 animate-pulse text-xs font-bold tracking-widest text-text uppercase">
					Securing session...
				</p>
			{/if}
		</div>
	{:else}
		<main class="flex grow flex-col">
			{@render children()}
		</main>
		<AssistantChat />
	{/if}
</div>
