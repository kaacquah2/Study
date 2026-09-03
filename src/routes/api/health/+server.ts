import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { isRedisConfigured } from '$lib/server/redis';
import { validateMLBackendConnection } from '$lib/server/ai/client';

const VERSION = '1.0.0';

/** Liveness response – instant process heartbeat, no dependency checks. */
function livenessResponse() {
	return json({ status: 'alive', version: VERSION, timestamp: new Date().toISOString() });
}

/**
 * Readiness response – parallel checks against Firestore, Redis, and the ML Backend.
 * Returns 200 while individual non-critical deps are degraded; 503 only if ALL deps fail.
 */
async function readinessResponse() {
	const checks: Record<string, 'ok' | 'degraded' | 'down'> = {};

	// 1. Firestore connectivity
	const fsResult = await Promise.race([
		adminDb
			.collection('_health_probe')
			.limit(1)
			.get()
			.then(() => 'ok' as const)
			.catch(() => 'down' as const),
		new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), 3000))
	]);
	checks.firestore = fsResult;

	// 2. Redis connectivity (optional dependency — degraded if not configured)
	if (isRedisConfigured()) {
		// Upstash REST API ping: issue a PING command and check response
		const redisCheck = await Promise.race([
			fetch((process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || '') + '/ping', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || ''}`
				}
			})
				.then((r) => (r.ok ? ('ok' as const) : ('down' as const)))
				.catch(() => 'down' as const),
			new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), 2000))
		]);
		checks.redis = redisCheck;
	} else {
		checks.redis = 'degraded'; // not configured – non-fatal
	}

	// 3. ML Backend connectivity
	const mlResult = await Promise.race([
		validateMLBackendConnection().then((r) => (r.ok ? ('ok' as const) : ('degraded' as const))),
		new Promise<'degraded'>((resolve) => setTimeout(() => resolve('degraded'), 5000))
	]);
	checks.ml_backend = mlResult;

	// Determine overall status: 503 only if Firestore (the essential backing store) is down.
	const firestoreDown = checks.firestore === 'down';
	const overallStatus = firestoreDown ? 'unavailable' : 'ready';
	const httpStatus = firestoreDown ? 503 : 200;

	return json(
		{
			status: overallStatus,
			version: VERSION,
			timestamp: new Date().toISOString(),
			checks
		},
		{ status: httpStatus }
	);
}

// GET /api/health?probe=liveness   → liveness check
// GET /api/health?probe=readiness  → readiness check (default)
// GET /api/health                  → readiness check
export const GET: RequestHandler = async ({ url }) => {
	const probe = url.searchParams.get('probe') || 'readiness';
	if (probe === 'liveness') {
		return livenessResponse();
	}
	return readinessResponse();
};
