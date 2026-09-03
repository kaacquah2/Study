import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	enqueueGenerationJob,
	enqueueModuleGenerationJob,
	processQueuedJob,
	reconcileStalledJobs,
	getGenerationJobStatus,
	updateGenerationJobStatus,
	calculateBackoffMs,
	sanitizeErrorMessage,
	type GenerationJob
} from './generationQueue';

vi.mock('../admin', () => {
	const mockJobs = new Map<string, Record<string, unknown>>();
	const mockModules = new Map<string, Record<string, unknown>>();
	const mockCourses = new Map<string, Record<string, unknown>>();

	const mockBatch = {
		set: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
			mockModules.set(ref.id, data);
		}),
		commit: vi.fn().mockResolvedValue(undefined)
	};

	const resolveIncrements = (
		existing: Record<string, unknown>,
		data: Record<string, unknown>
	): Record<string, unknown> => {
		const resolved: Record<string, unknown> = { ...data };
		for (const [k, v] of Object.entries(resolved)) {
			if (typeof v === 'object' && v !== null && '__increment' in v) {
				resolved[k] = Number(existing[k] || 0) + Number((v as { __increment: number }).__increment);
			}
		}
		return resolved;
	};

	const mockDb = {
		collection: vi.fn((colName: string) => ({
			doc: vi.fn((docId?: string) => {
				const id = docId || `mock_id_${Math.random().toString(36).slice(2, 8)}`;
				return {
					id,
					get: vi.fn(async () => {
						if (colName === 'course_generation_jobs') {
							const data = mockJobs.get(id);
							return { exists: !!data, data: () => (data ? { ...data } : undefined) };
						}
						if (colName === 'courses') {
							const data = mockCourses.get(id);
							return { exists: !!data, data: () => (data ? { ...data } : undefined) };
						}
						return { exists: false, data: () => undefined };
					}),
					set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
						if (colName === 'course_generation_jobs') {
							const existing = mockJobs.get(id) || {};
							const resolved = resolveIncrements(existing, data);
							resolved.__version = Number((existing.__version as number) || 0) + 1;
							mockJobs.set(id, opts?.merge ? { ...existing, ...resolved } : resolved);
						} else if (colName === 'courses') {
							const existing = mockCourses.get(id) || {};
							mockCourses.set(id, opts?.merge ? { ...existing, ...data } : data);
						}
					}),
					update: vi.fn(async (data: Record<string, unknown>) => {
						if (colName === 'course_generation_jobs') {
							const existing = mockJobs.get(id) || {};
							const resolved = resolveIncrements(existing, data);
							resolved.__version = Number((existing.__version as number) || 0) + 1;
							mockJobs.set(id, { ...existing, ...resolved });
						}
					}),
					collection: vi.fn(() => ({
						doc: vi.fn((subId?: string) => {
							const sId = subId || `mock_sub_${Math.random().toString(36).slice(2, 8)}`;
							return {
								id: sId,
								get: vi.fn(async () => {
									const data = mockModules.get(sId);
									return { exists: !!data, data: () => (data ? { ...data } : undefined) };
								}),
								set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
									const existing = mockModules.get(sId) || {};
									mockModules.set(sId, opts?.merge ? { ...existing, ...data } : data);
								})
							};
						}),
						orderBy: vi.fn(() => ({
							get: vi.fn(async () => {
								const docs = Array.from(mockModules.entries()).map(([mId, mData]) => ({
									id: mId,
									data: () => mData
								}));
								return { docs };
							})
						})),
						get: vi.fn(async () => {
							const docs = Array.from(mockModules.entries()).map(([mId, mData]) => ({
								id: mId,
								data: () => mData
							}));
							return { docs, size: docs.length };
						})
					}))
				};
			}),
			where: vi.fn(() => ({
				get: vi.fn(async () => {
					const docs = Array.from(mockJobs.values()).map((job) => ({
						data: () => job
					}));
					return { docs };
				})
			}))
		})),
		batch: vi.fn(() => mockBatch),
		runTransaction: vi.fn(async (updateFunction: (tx: unknown) => Promise<unknown>) => {
			let attempts = 0;
			const maxRetries = 5;
			while (attempts < maxRetries) {
				attempts++;
				const readVersions = new Map<string, number>();
				const pendingMutations: Array<() => void> = [];

				const tx = {
					get: vi.fn(async (ref: { id: string }) => {
						const data = mockJobs.get(ref.id) || mockCourses.get(ref.id) || mockModules.get(ref.id);
						readVersions.set(
							ref.id,
							Number((data as Record<string, unknown> | undefined)?.__version || 0)
						);
						return {
							exists: !!data,
							data: () => (data ? { ...data } : undefined)
						};
					}),
					update: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
						pendingMutations.push(() => {
							const existing = mockJobs.get(ref.id) || {};
							const currentVersion = Number((existing as Record<string, unknown>)?.__version || 0);
							const readVersion = readVersions.get(ref.id);
							if (readVersion !== undefined && currentVersion !== readVersion) {
								throw new Error('CONCURRENCY_CONFLICT');
							}
							const resolved = resolveIncrements(existing, data);
							resolved.__version = currentVersion + 1;
							mockJobs.set(ref.id, { ...existing, ...resolved });
						});
					}),
					set: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
						pendingMutations.push(() => {
							mockJobs.set(ref.id, { ...data, __version: Date.now() });
						});
					})
				};

				try {
					const result = await updateFunction(tx);
					for (const mutation of pendingMutations) {
						mutation();
					}
					return result;
				} catch (err) {
					if (
						err instanceof Error &&
						err.message === 'CONCURRENCY_CONFLICT' &&
						attempts < maxRetries
					) {
						await new Promise((resolve) => setTimeout(resolve, 10));
						continue;
					}
					throw err;
				}
			}
		})
	};

	return {
		adminDb: mockDb,
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_TS'),
			increment: vi.fn((n: number) => ({ __increment: n }))
		},
		__mockJobs: mockJobs,
		__mockModules: mockModules,
		__mockCourses: mockCourses
	};
});

vi.mock('./provider', () => ({
	generateOutline: vi.fn().mockResolvedValue({
		result: {
			title: 'Mock Generated Course',
			description: 'Mock course description',
			modules: [
				{
					order: 1,
					type: 'lesson',
					title: 'Module 1',
					summary: 'Summary 1',
					learningObjective: 'Objective 1',
					keyPoints: ['point 1']
				}
			]
		},
		provider: 'test-llm'
	}),
	generateLessonV2: vi.fn().mockResolvedValue({
		result: {
			pages: [
				{
					order: 1,
					heading: 'Intro',
					subheading: 'Welcome',
					blocks: [{ text: 'Lesson content here' }]
				}
			]
		},
		provider: 'test-llm'
	}),
	generateQuiz: vi.fn().mockResolvedValue({
		result: {
			questions: [
				{
					prompt: 'What is 2+2?',
					options: ['1', '2', '3', '4'],
					correctIndex: 3,
					explanation: '2 plus 2 equals 4'
				}
			]
		},
		provider: 'test-llm'
	})
}));

vi.mock('./providerStats', () => ({
	recordAttributionMetadata: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../outlineCache', () => ({
	getCachedOutline: vi.fn((_id: string, fetcher: () => Promise<unknown>) => fetcher())
}));

describe('generationQueue — Unified Durable Queue Engine', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { __mockJobs, __mockModules, __mockCourses } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
			__mockModules: Map<string, Record<string, unknown>>;
			__mockCourses: Map<string, Record<string, unknown>>;
		};
		__mockJobs.clear();
		__mockModules.clear();
		__mockCourses.clear();
	});

	it('enqueues a course outline generation job and sets initial state', async () => {
		const job = await enqueueGenerationJob({
			userId: 'user_123',
			courseId: 'course_abc',
			topic: 'Quantum Computing'
		});

		expect(job.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		expect(job.jobType).toBe('outline');
		expect(job.status).toBe('queued');
		expect(job.attempts).toBe(0);
		expect(job.courseId).toBe('course_abc');
		expect(job.leaseUntil).toBeNull();
		expect(job.nextRetryAt).toBeNull();
	});

	it('enqueues a module generation job and sets initial state', async () => {
		const job = await enqueueModuleGenerationJob({
			userId: 'user_123',
			courseId: 'course_abc',
			moduleId: 'mod_xyz'
		});

		expect(job.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		expect(job.jobType).toBe('module');
		expect(job.status).toBe('queued');
		expect(job.moduleId).toBe('mod_xyz');
	});

	it('updates and retrieves job status in Firestore without artificially incrementing attempts', async () => {
		const job = await enqueueGenerationJob({
			userId: 'user_456',
			courseId: 'course_def',
			topic: 'Algorithms'
		});

		await updateGenerationJobStatus(job.jobId, 'processing');
		let fetched = await getGenerationJobStatus(job.jobId);
		expect(fetched?.status).toBe('processing');
		expect(fetched?.attempts).toBe(0); // must NOT be incremented by updateGenerationJobStatus

		await updateGenerationJobStatus(job.jobId, 'failed', 'AI service unavailable');
		fetched = await getGenerationJobStatus(job.jobId);
		expect(fetched?.status).toBe('failed');
		expect(fetched?.errorMessage).toBe('AI service unavailable');
		expect(fetched?.attempts).toBe(0);
	});

	it('acquires a transactional lease and prevents duplicate processing by concurrent workers', async () => {
		const job = await enqueueGenerationJob({
			userId: 'user_conc',
			courseId: 'course_conc',
			topic: 'Concurrency'
		});

		// First worker claims and begins processing
		const firstWorker = processQueuedJob(job.jobId);

		// Second worker attempts to process concurrently
		const secondWorker = processQueuedJob(job.jobId);

		await Promise.all([firstWorker, secondWorker]);

		const finalJob = await getGenerationJobStatus(job.jobId);
		expect(finalJob?.status).toBe('completed');
		// Exactly 1 attempt should have been registered across both concurrent callers
		expect(finalJob?.attempts).toBe(1);
	});

	it('reclaims a job when its lease is expired and increments attempts atomically', async () => {
		const oldLease = Date.now() - 1000;
		const { __mockJobs } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
		};

		const stalledJob: GenerationJob = {
			jobId: 'job_lease_expired',
			jobType: 'outline',
			userId: 'user_stalled',
			courseId: 'course_stalled',
			topic: 'Distributed Systems',
			status: 'processing',
			attempts: 1,
			maxAttempts: 3,
			createdAt: Date.now() - 10 * 60 * 1000,
			updatedAt: Date.now() - 10 * 60 * 1000,
			leaseUntil: oldLease,
			nextRetryAt: null
		};

		__mockJobs.set(stalledJob.jobId, stalledJob as unknown as Record<string, unknown>);

		await processQueuedJob(stalledJob.jobId);

		const updated = await getGenerationJobStatus(stalledJob.jobId);
		expect(updated?.status).toBe('completed');
		expect(updated?.attempts).toBe(2);
	});

	it('does not claim a job if nextRetryAt backoff delay has not elapsed', async () => {
		const futureRetry = Date.now() + 60 * 1000; // 1 minute in future
		const { __mockJobs } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
		};

		const backingOffJob: GenerationJob = {
			jobId: 'job_backoff_active',
			jobType: 'outline',
			userId: 'user_backoff',
			courseId: 'course_backoff',
			topic: 'Backoff Testing',
			status: 'queued',
			attempts: 1,
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			leaseUntil: null,
			nextRetryAt: futureRetry
		};

		__mockJobs.set(backingOffJob.jobId, backingOffJob as unknown as Record<string, unknown>);

		await processQueuedJob(backingOffJob.jobId);

		const result = await getGenerationJobStatus(backingOffJob.jobId);
		// Should remain queued with unchanged attempts
		expect(result?.status).toBe('queued');
		expect(result?.attempts).toBe(1);
	});

	it('schedules retry with exponential backoff and sanitizes error on failure', async () => {
		const { generateOutline } = await import('./provider');
		vi.mocked(generateOutline).mockRejectedValueOnce(
			new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:8000')
		);

		const job = await enqueueGenerationJob({
			userId: 'user_err',
			courseId: 'course_err',
			topic: 'Error Handling'
		});

		await processQueuedJob(job.jobId);

		const updated = await getGenerationJobStatus(job.jobId);
		expect(updated?.status).toBe('queued');
		expect(updated?.attempts).toBe(1);
		expect(updated?.nextRetryAt).toBeGreaterThan(Date.now());
		// Error message must be sanitized, not raw ECONNREFUSED socket dump
		expect(updated?.errorMessage).not.toContain('ECONNREFUSED');
		expect(updated?.errorMessage).toContain('temporarily unreachable');
	});

	it('marks job as failed when retry budget is exhausted', async () => {
		const { generateOutline } = await import('./provider');
		vi.mocked(generateOutline).mockRejectedValue(new Error('Internal LLM 500 error'));

		const { __mockJobs } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
		};

		const lastAttemptJob: GenerationJob = {
			jobId: 'job_last_attempt',
			jobType: 'outline',
			userId: 'user_last',
			courseId: 'course_last',
			topic: 'Dead Letter Testing',
			status: 'queued',
			attempts: 2, // will be incremented to 3 (maxAttempts)
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			leaseUntil: null,
			nextRetryAt: null
		};

		__mockJobs.set(lastAttemptJob.jobId, lastAttemptJob as unknown as Record<string, unknown>);

		await processQueuedJob(lastAttemptJob.jobId);

		const finalJob = await getGenerationJobStatus(lastAttemptJob.jobId);
		expect(finalJob?.status).toBe('failed');
		expect(finalJob?.attempts).toBe(3);
		expect(finalJob?.errorMessage).toBe(
			'An unexpected error occurred while generating course content. Please try again.'
		);
	});

	it('reconciles stalled jobs by reclaiming unexpired jobs and dead-lettering expired jobs', async () => {
		const oldTimestamp = Date.now() - 10 * 60 * 1000;

		const unexpiredJob: GenerationJob = {
			jobId: 'job_stalled_recoverable',
			jobType: 'module',
			userId: 'user_1',
			courseId: 'c1',
			moduleId: 'm1',
			status: 'processing',
			attempts: 1,
			maxAttempts: 3,
			createdAt: oldTimestamp,
			updatedAt: oldTimestamp,
			leaseUntil: oldTimestamp
		};

		const deadJob: GenerationJob = {
			jobId: 'job_stalled_dead',
			jobType: 'outline',
			userId: 'user_2',
			courseId: 'c2',
			topic: 'Databases',
			status: 'processing',
			attempts: 3,
			maxAttempts: 3,
			createdAt: oldTimestamp,
			updatedAt: oldTimestamp,
			leaseUntil: oldTimestamp
		};

		const { __mockJobs } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
		};
		__mockJobs.set(unexpiredJob.jobId, unexpiredJob as unknown as Record<string, unknown>);
		__mockJobs.set(deadJob.jobId, deadJob as unknown as Record<string, unknown>);

		const result = await reconcileStalledJobs(5 * 60 * 1000);

		expect(result.recoveredCount).toBe(1);
		expect(result.failedCount).toBe(1);

		const deadDoc = await getGenerationJobStatus('job_stalled_dead');
		expect(deadDoc?.status).toBe('failed');
	});

	describe('Helper functions', () => {
		it('calculateBackoffMs produces exponential delays capped at maxMs', () => {
			const b1 = calculateBackoffMs(1, 1000, 10000);
			const b2 = calculateBackoffMs(2, 1000, 10000);
			const b3 = calculateBackoffMs(3, 1000, 10000);

			expect(b1).toBeGreaterThanOrEqual(1000);
			expect(b2).toBeGreaterThanOrEqual(2000);
			expect(b3).toBeGreaterThanOrEqual(4000);

			const highAttempt = calculateBackoffMs(10, 1000, 5000);
			expect(highAttempt).toBeLessThanOrEqual(5000);
		});

		it('sanitizeErrorMessage masks system/network internals and preserves quality validation', () => {
			expect(sanitizeErrorMessage(new Error('Quality validation error: Missing questions'))).toBe(
				'Quality validation error: Missing questions'
			);

			expect(sanitizeErrorMessage(new Error('HTTP 429: Too Many Requests ResourceExhausted'))).toBe(
				'The AI service is temporarily experiencing high demand. Please try again shortly.'
			);

			expect(sanitizeErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:8000'))).toBe(
				'The generation service timed out or was temporarily unreachable. Please retry.'
			);

			expect(sanitizeErrorMessage(new Error('FirebaseError: 7 PERMISSION_DENIED'))).toBe(
				'Service access error occurred during generation. Please contact support if this persists.'
			);

			expect(
				sanitizeErrorMessage(new Error('TypeError: Cannot read properties of undefined'))
			).toBe('An unexpected error occurred while generating course content. Please try again.');
		});
	});
});
