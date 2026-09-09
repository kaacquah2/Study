import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { getUserMistakes, resolveMistake } from '$lib/server/analytics/mistakeRecords';

export const GET: RequestHandler = async ({ request, url }) => {
	const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const user = await verifySessionUser(request);
		const moduleId = url.searchParams.get('moduleId') || undefined;
		const resolvedParam = url.searchParams.get('resolved');
		const resolved =
			resolvedParam !== null && resolvedParam !== '' ? resolvedParam === 'true' : undefined;

		const mistakes = await getUserMistakes(user.uid, { moduleId, resolved, limit: 100 });

		return json({ mistakes, requestId }, { headers: { 'X-Request-Id': requestId } });
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		if (
			errorMessage.toLowerCase().includes('unauthorized') ||
			errorMessage.toLowerCase().includes('session expired') ||
			errorMessage.toLowerCase().includes('invalid id token')
		) {
			return json(
				{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
				{ status: 401 }
			);
		}

		console.error('[analytics/mistakes GET] Error:', err);
		return json(
			{ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch mistake records' } },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const questionId = body?.questionId;

		if (!questionId) {
			return json(
				{ error: { code: 'MISSING_PARAM', message: 'questionId is required' } },
				{ status: 400, headers: { 'X-Request-Id': requestId } }
			);
		}

		await resolveMistake(user.uid, questionId);

		return json({ success: true, requestId }, { headers: { 'X-Request-Id': requestId } });
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		if (
			errorMessage.toLowerCase().includes('unauthorized') ||
			errorMessage.toLowerCase().includes('session expired') ||
			errorMessage.toLowerCase().includes('invalid id token')
		) {
			return json(
				{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
				{ status: 401 }
			);
		}

		console.error('[analytics/mistakes PATCH] Error:', err);
		return json(
			{ error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve mistake' } },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};
