import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { processQueuedJob, getGenerationJobStatus } from '$lib/server/ai/generationQueue';
import { getWorkerSecret } from '$lib/server/ai/taskDispatcher';
import crypto from 'crypto';

// POST /api/internal/worker/process-job
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

		// 2. Parse Task Payload
		const body = await request.json();
		const { jobId } = body;

		if (!jobId || typeof jobId !== 'string') {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Missing or invalid jobId' } },
				{ status: 400 }
			);
		}

		// 3. Process the Job
		await processQueuedJob(jobId);

		const updatedJob = await getGenerationJobStatus(jobId);

		return json({
			status: updatedJob?.status || 'completed',
			jobId,
			attempts: updatedJob?.attempts || 1,
			message: 'Job processed successfully'
		});
	} catch (err) {
		console.error('[Internal Worker] process-job error:', err);
		const message = err instanceof Error ? err.message : 'Worker execution failed';
		return json({ error: { code: 'WORKER_ERROR', message } }, { status: 500 });
	}
};
