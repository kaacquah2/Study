<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import {
		signInWithEmailAndPassword,
		createUserWithEmailAndPassword,
		signInWithPopup,
		GoogleAuthProvider,
		sendPasswordResetEmail
	} from 'firebase/auth';

	let isSignUp = $state(false);
	let isResetPassword = $state(false);
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);

	let emailError = $state('');
	let passwordError = $state('');
	let authError = $state('');
	let loading = $state(false);
	let successMessage = $state('');

	const validateForm = () => {
		let valid = true;

		if (!email) {
			emailError = 'Email address is required.';
			valid = false;
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			emailError = 'Please enter a valid email address.';
			valid = false;
		} else {
			emailError = '';
		}

		if (isResetPassword) return valid;

		if (!password) {
			passwordError = 'Password is required.';
			valid = false;
		} else if (password.length < 6) {
			passwordError = 'Password must be at least 6 characters.';
			valid = false;
		} else if (isSignUp && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
			passwordError =
				'Password for new accounts must be 8+ characters with at least one letter and one number.';
			valid = false;
		} else {
			passwordError = '';
		}

		return valid;
	};

	const getFriendlyAuthError = (code: string) => {
		switch (code) {
			case 'auth/invalid-email':
				return 'The email address entered is invalid.';
			case 'auth/user-disabled':
				return 'This account has been disabled.';
			case 'auth/user-not-found':
				return 'No account was found with this email address.';
			case 'auth/wrong-password':
				return 'The password entered is incorrect.';
			case 'auth/email-already-in-use':
				return 'An account already exists with this email address.';
			case 'auth/weak-password':
				return 'Please choose a stronger password (at least 8 characters with numbers).';
			case 'auth/invalid-credential':
				return 'Invalid credentials. Please check your email and password.';
			case 'auth/operation-not-allowed':
				return 'Google sign-in is not enabled in your Firebase console.';
			case 'auth/unauthorized-domain':
				return 'This domain is not authorized in your Firebase console.';
			case 'auth/popup-blocked':
				return 'The Google sign-in popup was blocked by your browser. Please allow popups.';
			case 'auth/network-request-failed':
				return 'Network connection error. Unable to reach authentication servers.';
			default:
				return code
					? `Authentication failed (${code}). Please check your settings.`
					: 'Authentication failed. Please check your credentials and network connection.';
		}
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		if (!validateForm() || loading) return;

		loading = true;
		authError = '';
		successMessage = '';

		try {
			if (isResetPassword) {
				await sendPasswordResetEmail(auth, email);
				successMessage = 'A password reset link has been sent to your email address.';
				isResetPassword = false;
			} else if (isSignUp) {
				await createUserWithEmailAndPassword(auth, email, password);
			} else {
				await signInWithEmailAndPassword(auth, email, password);
			}
		} catch (err) {
			console.error('Email Auth Error:', err);
			const code = (err as { code?: string }).code || '';
			authError = getFriendlyAuthError(code);
		} finally {
			loading = false;
		}
	};

	const handleGoogleSignIn = async () => {
		if (loading) return;
		loading = true;
		authError = '';
		successMessage = '';

		try {
			const provider = new GoogleAuthProvider();
			provider.setCustomParameters({ prompt: 'select_account' });
			await signInWithPopup(auth, provider);
		} catch (err) {
			console.error('Google Auth Error:', err);
			const code = (err as { code?: string }).code || '';
			if (code !== 'auth/popup-closed-by-user') {
				authError = getFriendlyAuthError(code);
			}
		} finally {
			loading = false;
		}
	};
</script>

<div class="mx-auto my-auto flex w-full max-w-md flex-col gap-6 py-8 md:py-0">
	<!-- Tabs -->
	{#if !isResetPassword}
		<div class="flex rounded-xl border border-border bg-surface-muted p-1">
			<button
				type="button"
				class="flex-1 cursor-pointer rounded-lg py-2 text-xs font-bold transition-all duration-180 {!isSignUp
					? 'bg-surface text-text shadow-sm'
					: 'text-text-muted hover:text-text'}"
				onclick={() => {
					isSignUp = false;
					authError = '';
					successMessage = '';
				}}
			>
				Sign In
			</button>
			<button
				type="button"
				class="flex-1 cursor-pointer rounded-lg py-2 text-xs font-bold transition-all duration-180 {isSignUp
					? 'bg-surface text-text shadow-sm'
					: 'text-text-muted hover:text-text'}"
				onclick={() => {
					isSignUp = true;
					authError = '';
					successMessage = '';
				}}
			>
				Create Account
			</button>
		</div>
	{/if}

	<!-- Form Heading -->
	<div>
		<h2 class="mb-1.5 font-display text-2xl font-bold text-text lg:text-3xl">
			{#if isResetPassword}
				Reset password
			{:else if isSignUp}
				Start your learning journey
			{:else}
				Welcome back
			{/if}
		</h2>
		<p class="text-xs text-text-muted lg:text-sm">
			{#if isResetPassword}
				Enter your email address to receive password reset instructions.
			{:else if isSignUp}
				Create an account to generate courses and track your daily streak.
			{:else}
				Log in to access your custom courses and continue your streak.
			{/if}
		</p>
	</div>

	<!-- Alerts -->
	{#if authError}
		<div
			class="animate-shake flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3.5 text-xs font-semibold text-danger shadow-xs"
		>
			<span class="leading-relaxed">{authError}</span>
		</div>
	{/if}

	{#if successMessage}
		<div
			class="flex items-start gap-2.5 rounded-xl border border-success/20 bg-success-soft p-3.5 text-xs font-semibold text-success shadow-xs"
		>
			<span class="leading-relaxed">{successMessage}</span>
		</div>
	{/if}

	<!-- Google OAuth -->
	{#if !isResetPassword}
		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs font-semibold text-text shadow-xs transition-all duration-180 hover:border-border/80 hover:bg-surface-muted focus:outline-none sm:text-sm"
			onclick={handleGoogleSignIn}
			disabled={loading}
		>
			<svg class="h-4.5 w-4.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					fill="#4285F4"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="#34A853"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
					fill="#FBBC05"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
					fill="#EA4335"
				/>
			</svg>
			Continue with Google
		</button>

		<div class="my-1 flex items-center justify-center text-center select-none">
			<div class="grow border-t border-border"></div>
			<span class="mx-3 text-[10px] font-bold tracking-wider text-text-muted uppercase"
				>or continue with email</span
			>
			<div class="grow border-t border-border"></div>
		</div>
	{/if}

	<!-- Form -->
	<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
		<div class="flex flex-col gap-1.5">
			<label for="email" class="text-xs font-bold tracking-wider text-text-muted uppercase">
				Email Address
			</label>
			<input
				type="email"
				id="email"
				class="w-full rounded-xl border bg-surface px-4 py-3 text-xs transition-colors duration-180 sm:text-sm {emailError
					? 'border-danger'
					: 'border-border'}"
				placeholder="alex@example.com"
				bind:value={email}
				onblur={() => validateForm()}
				disabled={loading}
			/>
			{#if emailError}
				<span class="pl-1 text-[11px] font-semibold text-danger">{emailError}</span>
			{/if}
		</div>

		{#if !isResetPassword}
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<label for="password" class="text-xs font-bold tracking-wider text-text-muted uppercase">
						Password
					</label>
					<button
						type="button"
						class="cursor-pointer text-xs font-semibold text-primary"
						onclick={() => {
							isResetPassword = true;
							authError = '';
							successMessage = '';
						}}
					>
						Forgot password?
					</button>
				</div>
				<div class="relative flex items-center">
					<input
						type={showPassword ? 'text' : 'password'}
						id="password"
						class="w-full rounded-xl border bg-surface py-3 pr-10 pl-4 text-xs transition-colors duration-180 sm:text-sm {passwordError
							? 'border-danger'
							: 'border-border'}"
						placeholder="••••••••••••"
						bind:value={password}
						onblur={() => validateForm()}
						disabled={loading}
					/>
					<button
						type="button"
						class="absolute right-3 cursor-pointer text-text-muted hover:text-text"
						onclick={() => (showPassword = !showPassword)}
					>
						{showPassword ? '👁️' : '🔒'}
					</button>
				</div>
				{#if passwordError}
					<span class="pl-1 text-[11px] font-semibold text-danger">{passwordError}</span>
				{/if}
			</div>
		{/if}

		<button
			type="submit"
			class="mt-2 w-full cursor-pointer rounded-xl bg-primary px-4 py-3.5 font-bold text-white shadow-md transition-all duration-180 select-none hover:bg-primary-hover disabled:opacity-50"
			disabled={loading}
		>
			{#if loading}
				Processing...
			{:else if isResetPassword}
				Send Reset Instructions
			{:else}
				{isSignUp ? 'Create Account' : 'Sign In to Dashboard'}
			{/if}
		</button>
	</form>

	<!-- Footer switcher -->
	<div class="mt-1 text-center text-xs text-text-muted">
		{#if isResetPassword}
			<button
				type="button"
				class="cursor-pointer font-semibold text-primary"
				onclick={() => {
					isResetPassword = false;
					authError = '';
					successMessage = '';
				}}
			>
				&larr; Return to Sign In
			</button>
		{:else}
			<span>{isSignUp ? 'Already have an account?' : "Don't have an account yet?"}</span>
			<button
				type="button"
				class="ml-1 cursor-pointer font-bold text-primary"
				onclick={() => {
					isSignUp = !isSignUp;
					authError = '';
					successMessage = '';
				}}
			>
				{isSignUp ? 'Sign In' : 'Create Account'}
			</button>
		{/if}
	</div>
</div>
