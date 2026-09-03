import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/health/live – lightweight liveness probe, no dependency checks. */
export const GET: RequestHandler = async () => {
	return json({ status: 'alive', version: '1.0.0', timestamp: new Date().toISOString() });
};
