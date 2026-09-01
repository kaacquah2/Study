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

<div class="md:flex-row flex min-h-screen flex-col bg-bg text-text">
	<HeroPanel />

	<div
		class="p-5 sm:p-10 md:w-1/2 md:p-10 lg:p-16 relative flex grow flex-col justify-between overflow-y-auto bg-surface"
	>
		<!-- Mobile Header Logo -->
		<div class="gap-2.5 md:hidden flex items-center">
			<div
				class="h-9 w-9 text-white flex items-center justify-center rounded-lg bg-primary shadow-md"
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
			<div class="max-w-md gap-6 py-8 md:py-0 mx-auto my-auto flex w-full flex-col">
				<div
					class="rounded-2xl p-6 border border-primary/20 bg-primary-soft/30 text-center shadow-sm"
				>
					<div
						class="mb-3 h-14 w-14 text-base font-bold mx-auto flex items-center justify-center rounded-full bg-primary-soft text-primary"
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

					<div class="mt-6 gap-3 flex flex-col">
						<a
							href="/app"
							class="gap-2 px-4 py-3.5 text-xs font-bold text-white sm:text-sm flex w-full items-center justify-center rounded-xl bg-primary shadow-md transition-all duration-180 hover:bg-primary-hover"
						>
							<span>Go to Dashboard</span>
							<span>&rarr;</span>
						</a>
						<button
							type="button"
							onclick={() => authStore.logout()}
							class="px-4 py-2.5 text-xs font-semibold w-full cursor-pointer rounded-xl border border-border bg-surface text-danger transition-colors duration-180 hover:bg-danger-soft"
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
			class="mt-10 gap-4 font-medium md:mt-0 flex flex-wrap items-center justify-center text-center text-[11px] text-text-muted select-none"
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
