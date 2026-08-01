/**
 * Thin HTTP client for the Python ML backend.
 *
 * All AI calls in provider.ts go through this module.
 * Centralises error handling, timeouts, circuit breaker, and the API key header.
 */

import { env } from '$env/dynamic/private';

/** Get ML Backend URL with fallbacks */
function getMLBackendUrl(): string {
	return env.ML_BACKEND_URL || process.env.ML_BACKEND_URL || 'http://localhost:8000';
}

/** Get ML Backend API Key with fallbacks */
function getMLBackendApiKey(): string {
	return env.ML_BACKEND_API_KEY || process.env.ML_BACKEND_API_KEY || '';
}

/** Default timeout: 120 seconds (model inference can be slow on CPU) */
const DEFAULT_TIMEOUT_MS = 120_000;

import { isRedisConfigured, redisGet, redisSet, redisIncr } from '$lib/server/redis';

// Circuit Breaker State (In-memory fallback + Redis synchronized)
let consecutiveFailures = 0;
let lastFailureTime = 0;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 30_000;

export class MLBackendError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly endpoint: string
	) {
		super(message);
		this.name = 'MLBackendError';
	}
}

async function isCircuitOpenAsync(): Promise<boolean> {
	if (isRedisConfigured()) {
		try {
			const redisOpen = await redisGet<boolean>('circuit_breaker:ml_backend:open');
			if (redisOpen) return true;
		} catch {
			// fallthrough to local
		}
	}
	if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
		if (Date.now() - lastFailureTime < CIRCUIT_RESET_MS) {
			return true;
		}
		consecutiveFailures = 0;
	}
	return false;
}

function recordSuccess(): void {
	consecutiveFailures = 0;
	if (isRedisConfigured()) {
		redisSet('circuit_breaker:ml_backend:open', false, 1).catch(() => {});
		redisSet('circuit_breaker:ml_backend:failures', 0, 1).catch(() => {});
	}
}

function recordFailure(): void {
	consecutiveFailures += 1;
	lastFailureTime = Date.now();
	if (isRedisConfigured()) {
		redisIncr('circuit_breaker:ml_backend:failures', 30)
			.then((count) => {
				if (count && count >= CIRCUIT_THRESHOLD) {
					redisSet('circuit_breaker:ml_backend:open', true, 30).catch(() => {});
				}
			})
			.catch(() => {});
	}
}

/**
 * POST to the ML backend and return the parsed JSON response.
 */
export async function callML<T>(
	endpoint: string,
	body: object = {},
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
	userId?: string
): Promise<T> {
	if (await isCircuitOpenAsync()) {
		throw new MLBackendError(
			`Circuit breaker OPEN for ML backend. Routing directly to fallback.`,
			503,
			endpoint
		);
	}

	const backendUrl = getMLBackendUrl();
	const apiKey = getMLBackendApiKey();
	const url = `${backendUrl}${endpoint}`;

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (apiKey) {
		headers['X-API-Key'] = apiKey;
	}

	if (userId) {
		headers['X-User-ID'] = userId;
	}

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs)
		});
	} catch (err) {
		recordFailure();
		const message = err instanceof Error ? err.message : 'Unknown network error';
		throw new MLBackendError(`ML backend unreachable at ${endpoint}: ${message}`, 503, endpoint);
	}

	if (!res.ok) {
		recordFailure();
		let detail: string;
		try {
			const errBody = await res.json();
			if (typeof errBody?.detail === 'object') {
				detail = JSON.stringify(errBody.detail);
			} else {
				detail = errBody?.detail ?? JSON.stringify(errBody);
			}
		} catch {
			detail = await res.text();
		}
		throw new MLBackendError(
			`ML backend error at ${endpoint} (HTTP ${res.status}): ${detail}`,
			res.status,
			endpoint
		);
	}

	recordSuccess();
	return res.json() as Promise<T>;
}

export interface MLBackendPingResult {
	available: boolean;
	busy: boolean;
	status?: string;
}

/**
 * Ping the ML backend health endpoint with circuit breaker check.
 */
export async function pingMLBackend(timeoutMs = 3_000): Promise<MLBackendPingResult> {
	if (await isCircuitOpenAsync()) {
		return { available: false, busy: false, status: 'CIRCUIT_OPEN' };
	}

	try {
		const backendUrl = getMLBackendUrl();
		const apiKey = getMLBackendApiKey();
		const headers: Record<string, string> = {};
		if (apiKey) headers['X-API-Key'] = apiKey;

		const res = await fetch(`${backendUrl}/healthcheck`, {
			headers,
			signal: AbortSignal.timeout(timeoutMs)
		});

		if (res.status === 401) {
			recordFailure();
			console.error(
				'[CRITICAL AUTH ERROR] ML_BACKEND_API_KEY mismatch! SvelteKit API key was rejected by the Python ML backend (401 Unauthorized).'
			);
			return { available: false, busy: false };
		}

		if (!res.ok) {
			recordFailure();
			return { available: false, busy: false };
		}

		recordSuccess();
		const body = await res.json().catch(() => ({}));
		return {
			available: true,
			busy: body?.inference_busy === true
		};
	} catch (err) {
		recordFailure();
		const msg = err instanceof Error ? err.message : 'Unreachable';
		console.warn(`[pingMLBackend] Could not reach ML backend at ${getMLBackendUrl()}: ${msg}`);
		return { available: false, busy: false };
	}
}

/** Explicit boot validation helper */
export async function validateMLBackendConnection(): Promise<{ ok: boolean; status: string }> {
	const backendUrl = getMLBackendUrl();
	const apiKey = getMLBackendApiKey();
	try {
		const headers: Record<string, string> = {};
		if (apiKey) headers['X-API-Key'] = apiKey;

		const res = await fetch(`${backendUrl}/healthcheck`, {
			headers,
			signal: AbortSignal.timeout(5_000)
		});

		if (res.status === 401) {
			return { ok: false, status: 'KEY_MISMATCH_401' };
		}
		return { ok: res.ok, status: res.ok ? 'OK' : `HTTP_${res.status}` };
	} catch (err) {
		return { ok: false, status: err instanceof Error ? err.message : 'UNREACHABLE' };
	}
}
