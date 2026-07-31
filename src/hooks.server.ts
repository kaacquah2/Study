import { validateMLBackendConnection } from '$lib/server/ai/client';
import type { Handle } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/admin';
import { json } from '@sveltejs/kit';

// Boot-time cross-service key & health validation.
// Models can take 20–60 s to load, so we attempt once immediately, then retry
// after a grace period if the backend is still warming up.
const HEALTH_CHECK_RETRY_DELAY_MS = 15_000;
const HEALTH_CHECK_MAX_RETRIES = 3;

async function runStartupHealthCheck(attempt = 1): Promise<void> {
	try {
		const result = await validateMLBackendConnection();

		if (result.status === 'KEY_MISMATCH_401') {
			// Config mismatch — retrying won't help, surface immediately.
			console.error(
				'================================================================================='
			);
			console.error(
				'[FATAL STARTUP CHECK] ML_BACKEND_API_KEY mismatch between SvelteKit and Python ML Backend!'
			);
			console.error(
				'Requests will fail with 401 Unauthorized until ML_BACKEND_API_KEY in .env matches.'
			);
			console.error(
				'================================================================================='
			);
			return;
		}

		if (result.ok) {
			console.log('[Startup Health Check] ML Backend connected & authenticated successfully.');
			return;
		}

		// Backend is offline or still warming — retry if attempts remain.
		if (attempt < HEALTH_CHECK_MAX_RETRIES) {
			console.warn(
				`[Startup Health Check] ML Backend not ready (${result.status}). ` +
					`Retrying in ${HEALTH_CHECK_RETRY_DELAY_MS / 1000}s… (attempt ${attempt}/${HEALTH_CHECK_MAX_RETRIES})`
			);
			setTimeout(() => runStartupHealthCheck(attempt + 1), HEALTH_CHECK_RETRY_DELAY_MS);
		} else {
			console.warn(
				`[Startup Health Check] ML Backend is offline after ${HEALTH_CHECK_MAX_RETRIES} attempts (${result.status}). ` +
					'Start the ML backend with: cd ml_backend && uvicorn main:app --reload --port 8000'
			);
		}
	} catch (err) {
		console.warn('[Startup Health Check] Error checking ML backend connection:', err);
	}
}

if (process.env.NODE_ENV !== 'test') {
	runStartupHealthCheck();
}

export const handle: Handle = async ({ event, resolve }) => {
	// CSRF Origin verification for API state-changing methods
	const method = event.request.method;
	if (
		['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) &&
		event.url.pathname.startsWith('/api/')
	) {
		const origin = event.request.headers.get('origin');
		const host = event.request.headers.get('host');
		const referer = event.request.headers.get('referer');

		if (!host) {
			return json(
				{ error: { code: 'BAD_REQUEST', message: 'Missing Host header.' } },
				{ status: 400 }
			);
		}

		let checkOriginHost: string | null = null;
		if (origin) {
			try {
				checkOriginHost = new URL(origin).host;
			} catch {
				return json(
					{ error: { code: 'BAD_REQUEST', message: 'Invalid Origin header.' } },
					{ status: 400 }
				);
			}
		} else if (referer) {
			try {
				checkOriginHost = new URL(referer).host;
			} catch {
				return json(
					{ error: { code: 'BAD_REQUEST', message: 'Invalid Referer header.' } },
					{ status: 400 }
				);
			}
		}

		if (!checkOriginHost) {
			// Fail closed: reject state-changing requests missing Origin/Referer
			return json(
				{
					error: {
						code: 'FORBIDDEN_CSRF',
						message: 'Cross-site request forgery protection triggered: Origin header missing.'
					}
				},
				{ status: 403 }
			);
		}

		if (checkOriginHost !== host) {
			const isLocal =
				(host.startsWith('localhost:') || host.startsWith('127.0.0.1:')) &&
				(checkOriginHost.startsWith('localhost:') || checkOriginHost.startsWith('127.0.0.1:'));
			if (!isLocal) {
				return json(
					{
						error: {
							code: 'FORBIDDEN_CSRF',
							message: 'Cross-site request forgery protection triggered.'
						}
					},
					{ status: 403 }
				);
			}
		}
	}

	const authHeader = event.request.headers.get('Authorization');
	if (authHeader && authHeader.startsWith('Bearer ')) {
		const idToken = authHeader.substring(7);
		try {
			const decodedToken = await adminAuth.verifyIdToken(idToken);
			event.locals.user = {
				uid: decodedToken.uid,
				email: decodedToken.email,
				name: decodedToken.name || null
			};
		} catch {
			// Token verification failed or expired
		}
	}
	return resolve(event);
};
