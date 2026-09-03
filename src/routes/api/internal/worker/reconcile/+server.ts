import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { reconcileStalledJobs } from '$lib/server/ai/generationQueue';
import { getWorkerSecret } from '$lib/server/ai/taskDispatcher';
import crypto from 'crypto';

// POST /api/internal/worker/reconcile
export const POST: RequestHandler = async ({ request }) => {
	try {
		// 1. Validate Worker Secret Header or Bearer Token
		const expectedSecret = getWorkerSecret();
		const providedSecret =
			request.headers.get('x-worker-secret') ||
			request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

		if (!expectedSecret || !providedSecret) {
			return json(
				{ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing worker secret' } },
				{ status: 401 }
			);
		}

		const providedBuf = Buffer.from(providedSecret);
		const expectedBuf = Buffer.from(expectedSecret);

		if (
			providedBuf.length !== expectedBuf.length ||
			!crypto.timingSafeEqual(providedBuf, expectedBuf)
		) {
			return json(
				{ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing worker secret' } },
				{ status: 401 }
			);
		}

		// 2. Perform Reconciliation
		const result = await reconcileStalledJobs();

		return json({
			status: 'ok',
			...result,
			message: `Reconciliation complete: ${result.recoveredCount} recovered, ${result.failedCount} dead-lettered`
		});
	} catch (err) {
		console.error('[Internal Worker] reconcile error:', err);
		const message = err instanceof Error ? err.message : 'Reconciliation failed';
		return json({ error: { code: 'RECONCILE_ERROR', message } }, { status: 500 });
	}
};
