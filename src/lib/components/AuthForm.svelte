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

<div class="max-w-md gap-8 py-8 md:py-0 mx-auto my-auto flex w-full flex-col">
	<!-- Tabs: Linear-style bottom-border indicator -->
	{#if !isResetPassword}
		<div
			class="flex"
			style="border-bottom: 1px solid var(--border);"
			role="tablist"
			aria-label="Authentication mode"
		>
			<button
				type="button"
				role="tab"
				aria-selected={!isSignUp}
				aria-controls="auth-form-panel"
				class="relative pb-3 pr-6 text-sm font-semibold cursor-pointer transition-colors duration-180 {!isSignUp
					? 'text-text'
					: 'text-text-subtle hover:text-text-muted'}"
				onclick={() => {
					isSignUp = false;
					authError = '';
					successMessage = '';
				}}
			>
				Sign In
				{#if !isSignUp}
					<span
						class="absolute -bottom-px left-0 right-6 h-0.5 rounded-full"
						style="background: var(--primary);"
					></span>
				{/if}
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={isSignUp}
				aria-controls="auth-form-panel"
				class="relative pb-3 pr-6 text-sm font-semibold cursor-pointer transition-colors duration-180 {isSignUp
					? 'text-text'
					: 'text-text-subtle hover:text-text-muted'}"
				onclick={() => {
					isSignUp = true;
					authError = '';
					successMessage = '';
				}}
			>
				Create Account
				{#if isSignUp}
					<span
						class="absolute -bottom-px left-0 right-6 h-0.5 rounded-full"
						style="background: var(--primary);"
					></span>
				{/if}
			</button>
		</div>
	{/if}

	<!-- Form Heading -->
	<div>
		<h2 class="mb-1.5 text-2xl font-bold tracking-tight text-text lg:text-[1.75rem]">
			{#if isResetPassword}
				Reset your password
			{:else if isSignUp}
				Create your account
			{:else}
				Welcome back
			{/if}
		</h2>
		<p class="text-sm text-text-muted">
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
			role="alert"
			aria-live="polite"
			class="animate-shake gap-2.5 p-3.5 text-xs font-semibold shadow-xs flex items-start rounded-xl border border-danger/20 bg-danger-soft text-danger"
		>
			<span class="leading-relaxed">{authError}</span>
		</div>
	{/if}

	{#if successMessage}
		<div
			role="status"
			aria-live="polite"
			class="gap-2.5 p-3.5 text-xs font-semibold shadow-xs flex items-start rounded-xl border border-success/20 bg-success-soft text-success"
		>
			<span class="leading-relaxed">{successMessage}</span>
		</div>
	{/if}

	<!-- Google OAuth -->
	{#if !isResetPassword}
		<button
			type="button"
			aria-label="Continue with Google authentication"
			class="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
			style="border-color: var(--border-strong); background: var(--surface); color: var(--text); box-shadow: var(--shadow-xs);"
			onclick={handleGoogleSignIn}
			disabled={loading}
		>
			<svg
				class="h-4.5 w-4.5 shrink-0"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
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

		<div class="flex items-center gap-3 select-none" aria-hidden="true">
			<div class="h-px flex-1" style="background: var(--border);"></div>
			<span class="text-[11px] font-semibold tracking-wider uppercase" style="color: var(--text-subtle);">or</span>
			<div class="h-px flex-1" style="background: var(--border);"></div>
		</div>
	{/if}

	<!-- Form -->
	<form id="auth-form-panel" class="gap-4 flex flex-col" onsubmit={handleSubmit}>
		<div class="flex flex-col gap-1.5">
			<label for="email" class="text-xs font-semibold tracking-wide" style="color: var(--text-muted);">
				Email address
			</label>
			<input
				type="email"
				id="email"
				aria-required="true"
				aria-invalid={!!emailError}
				aria-describedby={emailError ? 'email-error-msg' : undefined}
				class="w-full rounded-xl border px-4 py-3 text-sm transition-all duration-180 outline-none
					{emailError ? 'border-danger' : ''}"
				style="background: var(--surface); color: var(--text); border-color: {emailError ? 'var(--danger)' : 'var(--border-strong)'};
					box-shadow: {emailError ? '0 0 0 3px rgba(220,38,38,0.12)' : 'none'};"
				onfocus={(e) => { if (!emailError) (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px var(--primary-glow)'; (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--primary)'; }}
				onblur={(e) => { validateForm(); if (!emailError) { (e.currentTarget as HTMLInputElement).style.boxShadow = 'none'; (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-strong)'; }}}
				placeholder="alex@example.com"
				bind:value={email}
				disabled={loading}
			/>
			{#if emailError}
				<span id="email-error-msg" class="pl-1 text-[11px] font-semibold text-danger" role="alert"
					>{emailError}</span
				>
			{/if}
		</div>

		{#if !isResetPassword}
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<label for="password" class="text-xs font-semibold tracking-wide" style="color: var(--text-muted);">
						Password
					</label>
					<button
						type="button"
						class="text-xs font-semibold cursor-pointer transition-colors hover:text-text"
						style="color: var(--primary);"
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
						aria-required="true"
						aria-invalid={!!passwordError}
						aria-describedby={passwordError ? 'password-error-msg' : undefined}
						class="w-full rounded-xl border py-3 pl-4 pr-10 text-sm transition-all duration-180 outline-none"
						style="background: var(--surface); color: var(--text); border-color: {passwordError ? 'var(--danger)' : 'var(--border-strong)'};
							box-shadow: {passwordError ? '0 0 0 3px rgba(220,38,38,0.12)' : 'none'};"
						onfocus={(e) => { if (!passwordError) { (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px var(--primary-glow)'; (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--primary)'; }}}
						onblur={(e) => { validateForm(); if (!passwordError) { (e.currentTarget as HTMLInputElement).style.boxShadow = 'none'; (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-strong)'; }}}
						placeholder="••••••••••••"
						bind:value={password}
						disabled={loading}
					/>
					<button
						type="button"
						class="absolute right-3 cursor-pointer transition-colors"
						style="color: var(--text-subtle);"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						aria-controls="password"
					>
						<span aria-hidden="true">{showPassword ? '👁️' : '🔒'}</span>
					</button>
				</div>
				{#if passwordError}
					<span
						id="password-error-msg"
						class="pl-1 text-[11px] font-semibold text-danger"
						role="alert">{passwordError}</span
					>
				{/if}
			</div>
		{/if}

		<button
			type="submit"
			class="relative mt-2 flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-all duration-200 select-none hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
			style="background: var(--primary); box-shadow: var(--shadow-primary);"
			disabled={loading}
		>
			<!-- Diagonal shine overlay -->
			<span
				class="pointer-events-none absolute inset-0"
				style="background: linear-gradient(135deg, rgba(255,255,255,0.16) 0%, transparent 55%); border-radius: inherit;"
			></span>
			{#if loading}
				Processing...
			{:else if isResetPassword}
				Send Reset Instructions
			{:else}
				{isSignUp ? 'Create Account' : 'Sign In'}
			{/if}
		</button>
	</form>

	<!-- Footer switcher -->
	<div class="mt-1 text-xs text-center text-text-muted">
		{#if isResetPassword}
			<button
				type="button"
				class="font-semibold cursor-pointer text-primary"
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
				class="ml-1 font-bold cursor-pointer text-primary"
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
