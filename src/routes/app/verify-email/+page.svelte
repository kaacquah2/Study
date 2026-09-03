<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { sendEmailVerification } from 'firebase/auth';
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toastStore } from '$lib/stores/toast.svelte';

	let cooldown = $state(0);
	let sending = $state(false);

	$effect(() => {
		if (authStore.user?.emailVerified) {
			goto(resolve('/app'));
		}
	});

	// Poll email verification status every 3 seconds
	$effect(() => {
		const interval = setInterval(async () => {
			if (auth.currentUser) {
				await auth.currentUser.reload();
				if (auth.currentUser.emailVerified) {
					clearInterval(interval);
					toastStore.success('Email verified successfully!');
					goto(resolve('/app'));
				}
			}
		}, 3000);

		return () => clearInterval(interval);
	});

	const handleResend = async () => {
		if (cooldown > 0 || sending || !auth.currentUser) return;
		sending = true;

		try {
			await sendEmailVerification(auth.currentUser);
			toastStore.success('Verification email sent! Please check your inbox.');
			cooldown = 60;

			const timer = setInterval(() => {
				cooldown -= 1;
				if (cooldown <= 0) {
					clearInterval(timer);
				}
			}, 1000);
		} catch (err) {
			console.error('Error sending verification:', err);
			toastStore.error('Failed to send verification email. Try again later.');
		} finally {
			sending = false;
		}
	};
</script>

<svelte:head>
	<title>Verify Email &mdash; AI Study Buddy</title>
</svelte:head>

<div
	class="mx-auto my-auto flex w-full max-w-md flex-col items-center justify-center gap-6 py-12 text-center"
>
	<div
		class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-md"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-8 w-8"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
			/>
		</svg>
	</div>

	<div>
		<h1 class="font-display text-2xl font-bold text-text">Verify Your Email Address</h1>
		<p class="mt-2 text-xs leading-relaxed text-text-muted">
			We sent a verification link to <strong class="text-text"
				>{authStore.user?.email || 'your email'}</strong
			>. Please check your inbox and click the link to continue.
		</p>
	</div>

	<div class="flex w-full flex-col gap-3">
		<button
			type="button"
			onclick={handleResend}
			disabled={cooldown > 0 || sending}
			class="w-full cursor-pointer rounded-xl bg-primary py-3.5 text-xs font-bold text-white shadow-primary/20 shadow-md hover:bg-primary-hover active:scale-98 disabled:opacity-50"
		>
			{#if sending}
				Sending...
			{:else if cooldown > 0}
				Resend email in {cooldown}s
			{:else}
				Resend Verification Email
			{/if}
		</button>

		<a href={resolve('/app')} class="py-2 text-xs font-bold text-text-muted hover:text-text">
			I've verified my email &rarr;
		</a>
	</div>
</div>
