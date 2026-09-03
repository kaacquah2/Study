import type { RequestHandler } from './$types';
import { GET as readinessGET } from '../+server';

/** GET /api/health/ready – readiness probe (delegates to parent with readiness probe). */
export const GET: RequestHandler = async (event) => {
	// Force probe=readiness by overwriting the URL search params
	const url = new URL(event.url);
	url.searchParams.set('probe', 'readiness');
	return readinessGET({ ...event, url } as unknown as Parameters<typeof readinessGET>[0]);
};
