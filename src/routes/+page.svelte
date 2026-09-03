<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import HeroPanel from '$lib/components/HeroPanel.svelte';
	import AuthForm from '$lib/components/AuthForm.svelte';

	// Track whether the avatar image failed to load
	let avatarBroken = $state(false);
	$effect(() => {
		// Reset when user changes (e.g. after sign-out / sign-in)
		if (authStore.user?.photoURL) avatarBroken = false;
	});

	let userInitials = $derived.by(() => {
		const name = authStore.user?.displayName;
		if (name) return name.slice(0, 2).toUpperCase();
		return authStore.user?.email?.slice(0, 2).toUpperCase() ?? '??';
	});

	// If already logged in and explicit redirect param exists, redirect immediately
	$effect(() => {
		const redirect = page.url.searchParams.get('redirect');
		if (authStore.authResolved && authStore.user && redirect) {
			goto(redirect);
		}
	});
</script>

<svelte:head>
	<title>Sign In — AI Study Buddy</title>
	<meta
		name="description"
		content="AI Study Buddy - Build interactive courses, test your knowledge with AI quizzes, and maintain your learning streak."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col bg-bg text-text md:flex-row">
	<HeroPanel />

	<!-- Auth panel — right side -->
	<div
		class="relative flex grow flex-col justify-between overflow-y-auto p-6 sm:p-10 md:w-1/2 md:p-10 lg:p-14"
		style="background: var(--bg);"
	>
		<!-- Subtle background texture -->
		<div
			class="pointer-events-none absolute inset-0 opacity-[0.025]"
			style="background-image: radial-gradient(circle, var(--text) 1px, transparent 1px); background-size: 28px 28px;"
		></div>

		<!-- Mobile Header Logo -->
		<div class="relative z-10 flex items-center gap-2.5 md:hidden">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-xl text-white"
				style="background: var(--primary); box-shadow: 0 4px 12px var(--primary-glow);"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
					<path d="M6 10h10" />
				</svg>
			</div>
			<span class="text-base font-bold tracking-tight text-text">AI Study Buddy</span>
		</div>

		{#if authStore.user}
			<!-- Logged-in state -->
			<div class="relative z-10 mx-auto my-auto w-full max-w-md py-8 md:py-0">
				<div
					class="rounded-2xl p-6 text-center"
					style="background: var(--surface); border: 1px solid var(--border-strong); border-top-color: rgba(107,92,246,0.3); box-shadow: var(--shadow-lg), 0 0 0 1px var(--border);"
				>
					<!-- Avatar -->
					<div class="relative mb-4 inline-block">
						<div
							class="mx-auto flex h-15 w-15 items-center justify-center rounded-full text-sm font-bold text-primary"
							style="background: var(--primary-soft); border: 2px solid var(--border-strong); box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--border);"
						>
							{#if authStore.user.photoURL && !avatarBroken}
								<img
									src={authStore.user.photoURL}
									alt={authStore.user.displayName || 'Profile photo'}
									class="h-15 w-15 rounded-full object-cover"
									onerror={() => (avatarBroken = true)}
								/>
							{:else}
								{userInitials}
							{/if}
						</div>
						<!-- Online indicator -->
						<span
							class="absolute right-0.5 bottom-0.5 block h-3.5 w-3.5 rounded-full"
							style="background: var(--success); border: 2px solid var(--surface); box-shadow: 0 0 6px var(--success);"
						></span>
					</div>

					<h3 class="text-xl font-bold tracking-tight text-text">Welcome back!</h3>
					<p class="mt-1.5 text-[12px] text-text-muted">
						Signed in as <span class="font-semibold text-text">{authStore.user.email}</span>
					</p>

					<div class="mt-6 flex flex-col gap-3">
						<a
							href="/app"
							class="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-all duration-180"
							style="background: var(--primary); box-shadow: var(--shadow-primary);"
						>
							<!-- Shine overlay -->
							<span
								class="pointer-events-none absolute inset-0"
								style="background: linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 55%); border-radius: inherit;"
							></span>
							<span>Go to Dashboard</span>
							<span>→</span>
						</a>
						<button
							type="button"
							onclick={() => authStore.logout()}
							class="w-full cursor-pointer rounded-xl border border-border bg-surface px-4 py-2.5 text-[12px] font-semibold text-danger transition-colors duration-180 hover:bg-danger-soft"
						>
							Sign Out / Switch Account
						</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="relative z-10 flex grow flex-col justify-center">
				<AuthForm />
			</div>
		{/if}

		<!-- Footer Links -->
		<div
			class="relative z-10 mt-10 flex flex-wrap items-center justify-center gap-4 text-center text-[11px] font-medium text-text-subtle select-none md:mt-0"
		>
			<span>&copy; 2026 AI Study Buddy</span>
			<span style="opacity: 0.4;">&bull;</span>
			<a
				href="#terms"
				onclick={(e) => e.preventDefault()}
				class="transition-colors hover:text-text-muted">Terms</a
			>
			<span style="opacity: 0.4;">&bull;</span>
			<a
				href="#privacy"
				onclick={(e) => e.preventDefault()}
				class="transition-colors hover:text-text-muted">Privacy</a
			>
			<span style="opacity: 0.4;">&bull;</span>
			<a
				href="#help"
				onclick={(e) => e.preventDefault()}
				class="transition-colors hover:text-text-muted">Help</a
			>
		</div>
	</div>
</div>
