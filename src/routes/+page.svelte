<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import HeroPanel from '$lib/components/HeroPanel.svelte';
	import AuthForm from '$lib/components/AuthForm.svelte';

	// If already logged in and explicit redirect param exists (e.g. redirected from protected page), redirect immediately
	$effect(() => {
		const redirect = page.url.searchParams.get('redirect');
		if (authStore.authResolved && authStore.user && redirect) {
			goto(redirect);
		}
	});
</script>

<svelte:head>
	<title>Sign In &mdash; AI Study Buddy</title>
	<meta
		name="description"
		content="AI Study Buddy - Build interactive courses, test your knowledge with AI quizzes, and maintain your learning streak."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col bg-bg text-text md:flex-row">
	<HeroPanel />

	<div
		class="relative flex grow flex-col justify-between bg-surface p-6 sm:p-12 md:w-1/2 md:p-14 lg:p-20"
	>
		<!-- Mobile Header Logo -->
		<div class="flex items-center gap-2.5 md:hidden">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-md"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
					<path d="M6 10h10" />
				</svg>
			</div>
			<span class="font-display text-lg font-bold tracking-tight text-text">AI Study Buddy</span>
		</div>

		{#if authStore.user}
			<div class="mx-auto my-auto flex w-full max-w-md flex-col gap-6 py-8 md:py-0">
				<div
					class="rounded-2xl border border-primary/20 bg-primary-soft/30 p-6 text-center shadow-sm"
				>
					<div
						class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary"
					>
						{#if authStore.user.photoURL}
							<img
								src={authStore.user.photoURL}
								alt="Avatar"
								class="h-14 w-14 rounded-full object-cover"
							/>
						{:else}
							{authStore.user.displayName
								? authStore.user.displayName.slice(0, 2).toUpperCase()
								: authStore.user.email?.slice(0, 2).toUpperCase() || '??'}
						{/if}
					</div>
					<h3 class="font-display text-xl font-bold text-text">Welcome back!</h3>
					<p class="mt-1 text-xs text-text-muted">
						You are currently signed in as <span class="font-semibold text-text"
							>{authStore.user.email}</span
						>
					</p>

					<div class="mt-6 flex flex-col gap-3">
						<a
							href="/app"
							class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-xs font-bold text-white shadow-md transition-all duration-180 hover:bg-primary-hover sm:text-sm"
						>
							<span>Go to Dashboard</span>
							<span>&rarr;</span>
						</a>
						<button
							type="button"
							onclick={() => authStore.logout()}
							class="w-full cursor-pointer rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-danger transition-colors duration-180 hover:bg-danger-soft"
						>
							Sign Out / Switch Account
						</button>
					</div>
				</div>
			</div>
		{:else}
			<AuthForm />
		{/if}

		<!-- Footer Links -->
		<div
			class="mt-10 flex flex-wrap items-center justify-center gap-4 text-center text-[11px] font-medium text-text-muted select-none md:mt-0"
		>
			<span>&copy; 2026 AI Study Buddy</span>
			<span>&bull;</span>
			<a href="#terms" onclick={(e) => e.preventDefault()} class="transition-colors hover:text-text"
				>Terms</a
			>
			<span>&bull;</span>
			<a
				href="#privacy"
				onclick={(e) => e.preventDefault()}
				class="transition-colors hover:text-text">Privacy</a
			>
			<span>&bull;</span>
			<a href="#help" onclick={(e) => e.preventDefault()} class="transition-colors hover:text-text"
				>Help</a
			>
		</div>
	</div>
</div>
