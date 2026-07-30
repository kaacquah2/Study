<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import {
		signInWithEmailAndPassword,
		createUserWithEmailAndPassword,
		signInWithPopup,
		GoogleAuthProvider,
		sendPasswordResetEmail
	} from 'firebase/auth';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { isOpen, onClose, onSuccess }: Props = $props();

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
				return 'Please choose a stronger password (at least 6 characters).';
			case 'auth/invalid-credential':
				return 'Invalid credentials. Please check your email and password.';
			case 'auth/operation-not-allowed':
				return 'Google sign-in is not enabled in your Firebase console under Authentication -> Sign-in method.';
			case 'auth/unauthorized-domain':
				return 'This domain is not authorized in your Firebase console under Authentication -> Settings.';
			case 'auth/popup-blocked':
				return 'The Google sign-in popup was blocked by your browser. Please allow popups for this site.';
			case 'auth/network-request-failed':
				return 'Network connection error. Unable to reach Firebase authentication servers.';
			default:
				return code
					? `Authentication failed (${code}).`
					: 'Authentication failed. Please check your credentials.';
		}
	};

	const handleSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		authError = '';
		successMessage = '';

		if (!validateForm()) return;

		loading = true;
		try {
			if (isResetPassword) {
				await sendPasswordResetEmail(auth, email);
				successMessage = 'Password reset link sent! Check your inbox.';
			} else if (isSignUp) {
				await createUserWithEmailAndPassword(auth, email, password);
				onSuccess();
			} else {
				await signInWithEmailAndPassword(auth, email, password);
				onSuccess();
			}
		} catch (err: unknown) {
			const firebaseError = err as { code?: string; message?: string };
			authError = getFriendlyAuthError(firebaseError.code || '');
		} finally {
			loading = false;
		}
	};

	const handleGoogleSignIn = async () => {
		authError = '';
		successMessage = '';
		loading = true;

		try {
			const provider = new GoogleAuthProvider();
			provider.setCustomParameters({ prompt: 'select_account' });
			await signInWithPopup(auth, provider);
			onSuccess();
		} catch (err: unknown) {
			const firebaseError = err as { code?: string; message?: string };
			if (firebaseError.code !== 'auth/popup-closed-by-user') {
				authError = getFriendlyAuthError(firebaseError.code || '');
			}
		} finally {
			loading = false;
		}
	};
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			aria-label="Close modal backdrop"
			class="fixed inset-0 border-none bg-black/60 backdrop-blur-xs"
			onclick={onClose}
		></button>

		<div
			class="relative z-10 w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:p-8"
		>
			<button
				type="button"
				onclick={onClose}
				aria-label="Close modal"
				class="absolute top-4 right-4 text-text-muted hover:text-text"
			>
				&times;
			</button>

			<div class="mb-6 text-center">
				<h2 class="font-display text-xl font-bold text-text">
					{isResetPassword ? 'Reset Password' : isSignUp ? 'Create an Account' : 'Welcome Back'}
				</h2>
				<p class="mt-1 text-xs text-text-muted">
					{isResetPassword
						? 'Enter your email to receive a password reset link.'
						: isSignUp
							? 'Join AI Study Buddy and generate interactive courses.'
							: 'Sign in to access your AI learning workspace.'}
				</p>
			</div>

			{#if authError}
				<div
					class="mb-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger"
				>
					{authError}
				</div>
			{/if}

			{#if successMessage}
				<div
					class="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400"
				>
					{successMessage}
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="flex flex-col gap-4">
				<div>
					<label for="modal-email" class="mb-1.5 block text-xs font-bold text-text-muted"
						>Email address</label
					>
					<input
						id="modal-email"
						type="email"
						bind:value={email}
						placeholder="name@example.com"
						class="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs text-text focus:border-primary focus:outline-none"
					/>
					{#if emailError}
						<span class="mt-1 text-[11px] font-semibold text-danger">{emailError}</span>
					{/if}
				</div>

				{#if !isResetPassword}
					<div>
						<div class="mb-1.5 flex items-center justify-between">
							<label for="modal-password" class="text-xs font-bold text-text-muted">Password</label>
							{#if !isSignUp}
								<button
									type="button"
									onclick={() => (isResetPassword = true)}
									class="text-[11px] font-semibold text-primary hover:underline"
								>
									Forgot password?
								</button>
							{/if}
						</div>
						<div class="relative">
							<input
								id="modal-password"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								placeholder="••••••••"
								class="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs text-text focus:border-primary focus:outline-none"
							/>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-text-muted hover:text-text"
							>
								{showPassword ? 'Hide' : 'Show'}
							</button>
						</div>
						{#if passwordError}
							<span class="mt-1 text-[11px] font-semibold text-danger">{passwordError}</span>
						{/if}
					</div>
				{/if}

				<button
					type="submit"
					disabled={loading}
					class="mt-2 flex w-full items-center justify-center rounded-xl bg-primary py-3 text-xs font-bold text-white shadow-md transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50"
				>
					{loading
						? 'Please wait...'
						: isResetPassword
							? 'Send Reset Link'
							: isSignUp
								? 'Sign Up'
								: 'Sign In'}
				</button>
			</form>

			{#if !isResetPassword}
				<div class="relative my-6 text-center">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-border"></div>
					</div>
					<span class="relative bg-surface px-3 text-[11px] font-bold text-text-muted">OR</span>
				</div>

				<button
					type="button"
					onclick={handleGoogleSignIn}
					disabled={loading}
					class="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-2.5 text-xs font-bold text-text transition-colors hover:bg-surface-muted"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24">
						<path
							fill="#4285F4"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="#34A853"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="#FBBC05"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
						/>
						<path
							fill="#EA4335"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
						/>
					</svg>
					<span>Continue with Google</span>
				</button>
			{/if}

			<div class="mt-6 text-center text-xs font-semibold text-text-muted">
				{#if isResetPassword}
					<button
						type="button"
						onclick={() => (isResetPassword = false)}
						class="text-primary hover:underline"
					>
						Back to Sign In
					</button>
				{:else if isSignUp}
					Already have an account?
					<button
						type="button"
						onclick={() => (isSignUp = false)}
						class="text-primary hover:underline"
					>
						Sign In
					</button>
				{:else}
					Don't have an account?
					<button
						type="button"
						onclick={() => (isSignUp = true)}
						class="text-primary hover:underline"
					>
						Sign Up
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
