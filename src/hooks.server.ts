import { validateMLBackendConnection } from '$lib/server/ai/client';
import type { Handle, HandleServerError } from '@sveltejs/kit';
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

if (import.meta.env.DEV && process.env.NODE_ENV !== 'test') {
	runStartupHealthCheck();
}

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize correlation request ID for end-to-end tracing
	const requestId =
		event.request.headers.get('x-request-id') ||
		event.request.headers.get('x-correlation-id') ||
		crypto.randomUUID();
	event.locals.requestId = requestId;

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
				{ status: 400, headers: { 'X-Request-ID': requestId } }
			);
		}

		let checkOriginHost: string | null = null;
		if (origin) {
			try {
				checkOriginHost = new URL(origin).host;
			} catch {
				return json(
					{ error: { code: 'BAD_REQUEST', message: 'Invalid Origin header.' } },
					{ status: 400, headers: { 'X-Request-ID': requestId } }
				);
			}
		} else if (referer) {
			try {
				checkOriginHost = new URL(referer).host;
			} catch {
				return json(
					{ error: { code: 'BAD_REQUEST', message: 'Invalid Referer header.' } },
					{ status: 400, headers: { 'X-Request-ID': requestId } }
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
				{ status: 403, headers: { 'X-Request-ID': requestId } }
			);
		}

		if (checkOriginHost !== host) {
			return json(
				{
					error: {
						code: 'FORBIDDEN_CSRF',
						message: 'Cross-site request forgery protection triggered.'
					}
				},
				{ status: 403, headers: { 'X-Request-ID': requestId } }
			);
		}
	}

	let response = await resolve(event);

	// Defense-in-depth: intercept and sanitize API 500 error responses to prevent internal information leaks
	if (event.url.pathname.startsWith('/api/') && response.status === 500) {
		const contentType = response.headers.get('content-type');
		if (contentType && contentType.includes('application/json')) {
			try {
				const cloned = response.clone();
				const body = await cloned.json();
				if (body && typeof body === 'object') {
					let mutated = false;
					if (body.error && typeof body.error === 'object') {
						if (!body.error.requestId) {
							body.error.requestId = requestId;
							mutated = true;
						}
						// If message is the raw exception text or contains internal error leaks
						if (
							body.error.code === 'SERVER_ERROR' &&
							body.error.message &&
							body.error.message !== 'Internal Server Error'
						) {
							console.error(
								`[API 500 Leak Prevented] [req_id=${requestId}] Original message:`,
								body.error.message
							);
							body.error.message = 'Internal Server Error';
							mutated = true;
						}
					}
					if (!body.requestId) {
						body.requestId = requestId;
						mutated = true;
					}
					if (mutated) {
						const newHeaders = new Headers(response.headers);
						newHeaders.set('X-Request-ID', requestId);
						response = json(body, { status: 500, headers: newHeaders });
					}
				}
			} catch {
				// Fallback to generic JSON error if parsing failed
				const newHeaders = new Headers(response.headers);
				newHeaders.set('X-Request-ID', requestId);
				response = json(
					{
						error: {
							code: 'SERVER_ERROR',
							message: 'Internal Server Error',
							requestId
						},
						requestId
					},
					{ status: 500, headers: newHeaders }
				);
			}
		}
	}

	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; img-src 'self' data: https:; " +
			"script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
			"font-src 'self' https://fonts.gstatic.com; " +
			"connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com;"
	);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Request-ID', requestId);
	return response;
};

export const handleError: HandleServerError = ({ error, event }) => {
	const requestId = event.locals?.requestId || crypto.randomUUID();
	console.error(`[UNHANDLED_ERROR] [req_id=${requestId}]`, error);
	return {
		message: 'Internal Server Error',
		requestId
	};
};
