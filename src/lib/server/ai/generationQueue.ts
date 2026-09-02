/**
 * Unified Generation Queue & Worker Engine
 *
 * Provides a durable, restart-safe background execution pipeline for:
 * 1. Course Outline Generation (Tier 4 Quota / High-Demand Fallback)
 * 2. Individual Module Generation (Lessons and Quizzes)
 *
 * Integrates with TaskDispatcher (Cloud Tasks / Webhook / Local Worker)
 * and includes a self-healing reconciler for recovering orphaned or crashed jobs.
 */

import { adminDb, FieldValue } from '../admin';
import { generateOutline, generateLessonV2, generateQuiz } from './provider';
import { recordAttributionMetadata } from './providerStats';
import { getCachedOutline } from '../outlineCache';
import { dispatchGenerationTask, type QueuedTaskPayload } from './taskDispatcher';

export interface GenerationJob {
	jobId: string;
	jobType: 'outline' | 'module';
	userId: string;
	courseId: string;
	moduleId?: string;
	topic?: string;
	status: 'queued' | 'processing' | 'completed' | 'failed';
	attempts: number;
	maxAttempts: number;
	errorMessage?: string;
	createdAt: number;
	updatedAt: number;
}

export const MAX_QUEUE_ATTEMPTS = 3;
export const STALLED_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Executes an outline generation job.
 */
async function processOutlineJob(job: GenerationJob): Promise<void> {
	if (!adminDb || !job.topic) return;

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
		status: 'building',
		format: 'lessons_and_quizzes',
		accentColor: accent,
		tags: [job.topic.split(' ')[0]],
		estimatedMinutes: 48,
		progress: { completed: 0, total: outline.modules.length },
		createdAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	});

	const batch = adminDb.batch();
	const createdModuleIds: string[] = [];

	outline.modules.forEach((mod) => {
		const modRef = courseRef.collection('modules').doc();
		createdModuleIds.push(modRef.id);
		batch.set(modRef, {
			id: modRef.id,
			courseId,
			order: mod.order,
			type: mod.type,
			title: mod.title,
			summary: mod.summary,
			learningObjective: mod.learningObjective || mod.summary,
			keyPoints: mod.keyPoints || [],
			status: 'pending',
			attempts: 0
		});
	});
	await batch.commit();

	// Enqueue durable module generation jobs for all created modules
	for (const modId of createdModuleIds) {
		await enqueueModuleGenerationJob({
			courseId,
			moduleId: modId,
			userId: job.userId
		});
	}
}

/**
 * Executes an individual module generation job.
 */
async function processModuleJob(job: GenerationJob): Promise<void> {
	if (!adminDb || !job.moduleId) return;

	const courseRef = adminDb.collection('courses').doc(job.courseId);
	const moduleRef = courseRef.collection('modules').doc(job.moduleId);

	const [courseDoc, moduleDoc] = await Promise.all([courseRef.get(), moduleRef.get()]);

	if (!courseDoc.exists) throw new Error(`Course ${job.courseId} not found`);
	if (!moduleDoc.exists) throw new Error(`Module ${job.moduleId} not found`);

	const courseData = courseDoc.data() || {};
	const moduleData = moduleDoc.data() || {};

	// If already ready, no-op
	if (moduleData.status === 'ready') return;

	// Set module state to generating
	await moduleRef.set(
		{
			status: 'generating',
			attempts: FieldValue.increment(1),
			updatedAt: FieldValue.serverTimestamp()
		},
		{ merge: true }
	);

	// Load course outline context
	const outlineModules = await getCachedOutline(job.courseId, async () => {
		const modulesSnapshot = await courseRef.collection('modules').orderBy('order', 'asc').get();
		return modulesSnapshot.docs.map((doc) => {
			const data = doc.data();
			return {
				order: data.order,
				type: data.type,
				title: data.title,
				summary: data.summary,
				learningObjective: data.learningObjective || '',
				keyPoints: data.keyPoints || []
			};
		});
	});

	const courseOutline = {
		title: courseData.title || 'Course',
		description: courseData.description || '',
		modules: outlineModules
	};

	if (moduleData.type === 'lesson') {
		const { result, provider } = await generateLessonV2(
			courseOutline.title,
			courseOutline,
			moduleData.title,
			moduleData.learningObjective || '',
			moduleData.keyPoints || [],
			job.userId
		);

		const pages = result.pages.map((page) => ({
			order: page.order,
			heading: page.heading,
			subheading: page.subheading,
			blocks: page.blocks
		}));

		const totalWords = pages.reduce((acc, p) => {
			const blockText = p.blocks
				.map((b) => ('markdown' in b ? b.markdown : 'text' in b ? b.text : ''))
				.join(' ');
			return acc + (blockText ? blockText.split(/\s+/).filter(Boolean).length : 0);
		}, 0);
		const estMinutes = Math.max(2, Math.ceil(totalWords / 200));

		await moduleRef.set(
			{
				pages,
				contentVersion: 2,
				estimatedMinutes: estMinutes,
				status: 'ready',
				model: provider,
				generatedAt: FieldValue.serverTimestamp(),
				error: null
			},
			{ merge: true }
		);

		await recordAttributionMetadata(
			'modules',
			job.moduleId,
			{ servicedByProvider: provider },
			job.courseId
		);
	} else if (moduleData.type === 'quiz') {
		const { result, provider } = await generateQuiz(
			courseOutline.title,
			courseOutline,
			moduleData.title,
			moduleData.learningObjective || '',
			moduleData.keyPoints || [],
			job.userId
		);

		// Quality guardrail validation
		for (const q of result.questions) {
			if (!q.prompt || typeof q.prompt !== 'string' || q.prompt.trim().length === 0) {
				throw new Error('Quality validation error: Quiz question prompt cannot be empty.');
			}
			if (!Array.isArray(q.options) || q.options.length !== 4) {
				throw new Error('Quality validation error: Quiz question must have exactly 4 options.');
			}
			const uniqueOptions = new Set(q.options.map((o) => o.trim().toLowerCase()));
			if (uniqueOptions.size < 4) {
				throw new Error('Quality validation error: Quiz question options must be distinct.');
			}
			if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
				throw new Error('Quality validation error: Quiz correct option index must be 0-3.');
			}
			if (!q.explanation || q.explanation.trim().length < 5) {
				throw new Error('Quality validation error: Quiz explanation is missing or incomplete.');
			}
		}

		const estMinutes = Math.max(2, Math.ceil((result.questions.length * 45) / 60));

		await moduleRef.set(
			{
				questions: result.questions,
				estimatedMinutes: estMinutes,
				status: 'ready',
				model: provider,
				generatedAt: FieldValue.serverTimestamp(),
				error: null
			},
			{ merge: true }
		);

		await recordAttributionMetadata(
			'modules',
			job.moduleId,
			{ servicedByProvider: provider },
			job.courseId
		);
	}

	// Update overall course status
	const updatedSnapshot = await courseRef.collection('modules').get();
	const modulesData = updatedSnapshot.docs.map((doc) => doc.data());
	const statuses = modulesData.map((m) => m.status);
	const allReady = statuses.every((s) => s === 'ready');
	const anyFailed = statuses.some((s) => s === 'failed');

	const totalCourseEstMinutes = modulesData.reduce(
		(acc, m) => acc + (typeof m.estimatedMinutes === 'number' ? m.estimatedMinutes : 12),
		0
	);

	if (allReady) {
		await courseRef.set(
			{
				status: 'ready',
				estimatedMinutes: totalCourseEstMinutes,
				updatedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);
	} else if (anyFailed) {
		await courseRef.set(
			{
				status: 'partial',
				estimatedMinutes: totalCourseEstMinutes,
				updatedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);
	} else {
		await courseRef.set(
			{
				status: 'building',
				estimatedMinutes: totalCourseEstMinutes,
				updatedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);
	}
}

/**
 * Executes a queued course generation job asynchronously in the background.
 */
export async function processQueuedJob(jobId: string): Promise<void> {
	if (!adminDb || process.env.NODE_ENV === 'test') return;

	try {
		const job = await getGenerationJobStatus(jobId);
		if (!job || job.status === 'completed') return;

		await updateGenerationJobStatus(jobId, 'processing');

		if (job.jobType === 'outline') {
			await processOutlineJob(job);
		} else if (job.jobType === 'module') {
			await processModuleJob(job);
		}

		await updateGenerationJobStatus(jobId, 'completed');
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown generation error';
		console.error(`[generationQueue] Failed processing job ${jobId}:`, err);
		await updateGenerationJobStatus(jobId, 'failed', message);

		// If it's a module job, mark the module as failed as well
		const job = await getGenerationJobStatus(jobId);
		if (job && job.jobType === 'module' && job.moduleId && adminDb) {
			try {
				const courseRef = adminDb.collection('courses').doc(job.courseId);
				await courseRef.collection('modules').doc(job.moduleId).set(
					{
						status: 'failed',
						error: message
					},
					{ merge: true }
				);
				await courseRef.set(
					{
						status: 'partial',
						updatedAt: FieldValue.serverTimestamp()
					},
					{ merge: true }
				);
			} catch (dbErr) {
				console.warn(
					'[generationQueue] Failed to update module failure status in Firestore:',
					dbErr
				);
			}
		}
	}
}

/**
 * Enqueues a course outline generation job.
 */
export async function enqueueGenerationJob(params: {
	userId: string;
	courseId: string;
	topic: string;
}): Promise<GenerationJob> {
	const jobId = `job_outline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const now = Date.now();

	const job: GenerationJob = {
		jobId,
		jobType: 'outline',
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

			const payload: QueuedTaskPayload = {
				jobId,
				jobType: 'outline',
				courseId: params.courseId,
				userId: params.userId
			};

			await dispatchGenerationTask(payload, async () => {
				await processQueuedJob(jobId);
			});
		} catch (err) {
			console.error('[generationQueue] Failed to enqueue outline job in Firestore:', err);
		}
	}

	return job;
}

/**
 * Enqueues a per-module generation job (for lesson or quiz).
 */
export async function enqueueModuleGenerationJob(params: {
	courseId: string;
	moduleId: string;
	userId: string;
}): Promise<GenerationJob> {
	const jobId = `job_mod_${params.moduleId}_${Date.now()}`;
	const now = Date.now();

	const job: GenerationJob = {
		jobId,
		jobType: 'module',
		userId: params.userId,
		courseId: params.courseId,
		moduleId: params.moduleId,
		status: 'queued',
		attempts: 0,
		maxAttempts: MAX_QUEUE_ATTEMPTS,
		createdAt: now,
		updatedAt: now
	};

	if (adminDb && process.env.NODE_ENV !== 'test') {
		try {
			await adminDb.collection('course_generation_jobs').doc(jobId).set(job);

			const payload: QueuedTaskPayload = {
				jobId,
				jobType: 'module',
				courseId: params.courseId,
				moduleId: params.moduleId,
				userId: params.userId
			};

			await dispatchGenerationTask(payload, async () => {
				await processQueuedJob(jobId);
			});
		} catch (err) {
			console.error('[generationQueue] Failed to enqueue module job in Firestore:', err);
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

/**
 * Reconciles stalled generation jobs (older than timeout).
 * Recovers crashed worker instances and marks dead-letter jobs as failed.
 */
export async function reconcileStalledJobs(
	stalledThresholdMs: number = STALLED_JOB_TIMEOUT_MS
): Promise<{ recoveredCount: number; failedCount: number }> {
	if (!adminDb || process.env.NODE_ENV === 'test') {
		return { recoveredCount: 0, failedCount: 0 };
	}

	let recoveredCount = 0;
	let failedCount = 0;
	const cutoff = Date.now() - stalledThresholdMs;

	try {
		const snapshot = await adminDb
			.collection('course_generation_jobs')
			.where('status', 'in', ['queued', 'processing'])
			.get();

		for (const doc of snapshot.docs) {
			const job = doc.data() as GenerationJob;
			if (job.updatedAt < cutoff) {
				if (job.attempts < job.maxAttempts) {
					console.warn(
						`[generationQueue] Reclaiming stalled job ${job.jobId} (attempt ${job.attempts + 1}/${job.maxAttempts})`
					);
					await updateGenerationJobStatus(job.jobId, 'queued');

					const payload: QueuedTaskPayload = {
						jobId: job.jobId,
						jobType: job.jobType,
						courseId: job.courseId,
						moduleId: job.moduleId,
						userId: job.userId
					};

					await dispatchGenerationTask(payload, async () => {
						await processQueuedJob(job.jobId);
					});

					recoveredCount++;
				} else {
					console.error(
						`[generationQueue] Dead-lettering stalled job ${job.jobId} (exceeded max attempts)`
					);
					await updateGenerationJobStatus(
						job.jobId,
						'failed',
						'Job execution timed out and exceeded max retry attempts'
					);
					failedCount++;
				}
			}
		}
	} catch (err) {
		console.error('[generationQueue] Error during job reconciliation:', err);
	}

	return { recoveredCount, failedCount };
}
