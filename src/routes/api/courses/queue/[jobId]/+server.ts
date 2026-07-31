import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { getGenerationJobStatus, processQueuedJob } from '$lib/server/ai/generationQueue';

export const GET: RequestHandler = async ({ params, request }) => {
	const { jobId } = params;

	try {
		await verifySessionUser(request);

		const job = await getGenerationJobStatus(jobId);
		if (!job) {
			return json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, { status: 404 });
		}

		// If job has been stuck queued, attempt processing
		if (job.status === 'queued') {
			processQueuedJob(jobId).catch(() => {});
		}

		return json(job);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
