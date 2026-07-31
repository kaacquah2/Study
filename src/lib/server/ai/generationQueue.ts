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

import { generateOutline } from './provider';

/**
 * Executes a queued course generation job asynchronously in the background.
 */
export async function processQueuedJob(jobId: string): Promise<void> {
	if (!adminDb || process.env.NODE_ENV === 'test') return;

	try {
		const job = await getGenerationJobStatus(jobId);
		if (!job || job.status === 'completed' || job.status === 'processing') return;

		await updateGenerationJobStatus(jobId, 'processing');

		const outlineRes = await generateOutline(
			job.topic,
			4,
			'lessons_and_quizzes',
			undefined,
			job.userId
		);
		const outline = outlineRes.result;

		const courseRef = adminDb.collection('courses').doc(job.courseId);
		const courseId = job.courseId;

		const accents = ['violet', 'amber', 'emerald'] as const;
		const accent = accents[Math.floor(Math.random() * accents.length)];

		await courseRef.set({
			id: courseId,
			ownerUid: job.userId,
			title: outline.title,
			description: outline.description,
			topic: job.topic,
			level: 'intermediate',
			goal: 'curiosity',
			status: 'draft',
			format: 'lessons_and_quizzes',
			accentColor: accent,
			tags: [job.topic.split(' ')[0]],
			estimatedMinutes: 48,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});

		const batch = adminDb.batch();
		outline.modules.forEach((mod) => {
			const modRef = courseRef.collection('modules').doc();
			batch.set(modRef, {
				id: modRef.id,
				courseId,
				order: mod.order,
				type: mod.type,
				title: mod.title,
				summary: mod.summary,
				learningObjective: mod.learningObjective,
				keyPoints: mod.keyPoints,
				status: 'pending',
				attempts: 0
			});
		});
		await batch.commit();

		await updateGenerationJobStatus(jobId, 'completed');
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown generation error';
		console.error(`[generationQueue] Failed processing job ${jobId}:`, err);
		await updateGenerationJobStatus(jobId, 'failed', message);
	}
}

/**
 * Enqueues a new background course generation job in Firestore and kicks off processing.
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
			// Kick off processing non-blockingly
			setTimeout(() => {
				processQueuedJob(jobId).catch((e) =>
					console.error(`[generationQueue] Async job execution error for ${jobId}:`, e)
				);
			}, 1000);
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
