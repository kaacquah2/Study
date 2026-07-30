/**
 * Generation Queue — Tier 4 Graceful Degradation Queueing
 *
 * Built strictly on Firestore (`course_generation_jobs` collection).
 * Handles asynchronous background course generation when Gemini Flash returns 429 quota exhaustion
 * and local providers are saturated or offline.
 */

import { adminDb, FieldValue } from '../admin';

export interface GenerationJob {
	jobId: string;
	userId: string;
	courseId: string;
	topic: string;
	status: 'queued' | 'processing' | 'completed' | 'failed';
	attempts: number;
	maxAttempts: number;
	errorMessage?: string;
	createdAt: number;
	updatedAt: number;
}

export const MAX_QUEUE_ATTEMPTS = 3;
export const MAX_QUEUE_TIME_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Enqueues a new background course generation job in Firestore.
 */
export async function enqueueGenerationJob(params: {
	userId: string;
	courseId: string;
	topic: string;
}): Promise<GenerationJob> {
	const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const now = Date.now();

	const job: GenerationJob = {
		jobId,
		userId: params.userId,
		courseId: params.courseId,
		topic: params.topic,
		status: 'queued',
		attempts: 0,
		maxAttempts: MAX_QUEUE_ATTEMPTS,
		createdAt: now,
		updatedAt: now
	};

	if (adminDb && process.env.NODE_ENV !== 'test') {
		try {
			await adminDb.collection('course_generation_jobs').doc(jobId).set(job);
		} catch (err) {
			console.error('[generationQueue] Failed to enqueue job in Firestore:', err);
		}
	}

	return job;
}

/**
 * Fetches current status of a queued generation job.
 */
export async function getGenerationJobStatus(jobId: string): Promise<GenerationJob | null> {
	if (!adminDb || process.env.NODE_ENV === 'test') {
		return null;
	}

	try {
		const doc = await adminDb.collection('course_generation_jobs').doc(jobId).get();
		if (!doc.exists) return null;
		return doc.data() as GenerationJob;
	} catch (err) {
		console.error(`[generationQueue] Failed to fetch status for job ${jobId}:`, err);
		return null;
	}
}

/**
 * Updates status of a queued generation job in Firestore.
 */
export async function updateGenerationJobStatus(
	jobId: string,
	status: GenerationJob['status'],
	errorMessage?: string
): Promise<void> {
	if (!adminDb || process.env.NODE_ENV === 'test') return;

	try {
		const updateData: Record<string, unknown> = {
			status,
			updatedAt: Date.now(),
			attempts: FieldValue.increment(1)
		};
		if (errorMessage) {
			updateData.errorMessage = errorMessage;
		}

		await adminDb.collection('course_generation_jobs').doc(jobId).update(updateData);
	} catch (err) {
		console.error(`[generationQueue] Failed to update status for job ${jobId}:`, err);
	}
}
