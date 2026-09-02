import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	enqueueGenerationJob,
	enqueueModuleGenerationJob,
	reconcileStalledJobs,
	getGenerationJobStatus,
	updateGenerationJobStatus,
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

	const mockDb = {
		collection: vi.fn((colName: string) => ({
			doc: vi.fn((docId?: string) => {
				const id = docId || `mock_id_${Math.random().toString(36).slice(2, 8)}`;
				return {
					id,
					get: vi.fn(async () => {
						if (colName === 'course_generation_jobs') {
							const data = mockJobs.get(id);
							return { exists: !!data, data: () => data };
						}
						if (colName === 'courses') {
							const data = mockCourses.get(id);
							return { exists: !!data, data: () => data };
						}
						return { exists: false, data: () => undefined };
					}),
					set: vi.fn(async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
						if (colName === 'course_generation_jobs') {
							const existing = mockJobs.get(id) || {};
							mockJobs.set(id, opts?.merge ? { ...existing, ...data } : data);
						} else if (colName === 'courses') {
							const existing = mockCourses.get(id) || {};
							mockCourses.set(id, opts?.merge ? { ...existing, ...data } : data);
						}
					}),
					update: vi.fn(async (data: Record<string, unknown>) => {
						if (colName === 'course_generation_jobs') {
							const existing = mockJobs.get(id) || {};
							mockJobs.set(id, { ...existing, ...data });
						}
					}),
					collection: vi.fn(() => ({
						doc: vi.fn((subId?: string) => {
							const sId = subId || `mock_sub_${Math.random().toString(36).slice(2, 8)}`;
							return {
								id: sId,
								get: vi.fn(async () => {
									const data = mockModules.get(sId);
									return { exists: !!data, data: () => data };
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
		batch: vi.fn(() => mockBatch)
	};

	return {
		adminDb: mockDb,
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_TS'),
			increment: vi.fn((n: number) => n)
		},
		__mockJobs: mockJobs,
		__mockModules: mockModules,
		__mockCourses: mockCourses
	};
});

vi.mock('./provider', () => ({
	generateOutline: vi.fn(),
	generateLessonV2: vi.fn(),
	generateQuiz: vi.fn()
}));

vi.mock('./providerStats', () => ({
	recordAttributionMetadata: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../outlineCache', () => ({
	getCachedOutline: vi.fn((_id: string, fetcher: () => Promise<unknown>) => fetcher())
}));

describe('generationQueue — Unified Durable Queue Engine', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enqueues a course outline generation job and sets initial state', async () => {
		const job = await enqueueGenerationJob({
			userId: 'user_123',
			courseId: 'course_abc',
			topic: 'Quantum Computing'
		});

		expect(job.jobId).toMatch(/^job_outline_/);
		expect(job.jobType).toBe('outline');
		expect(job.status).toBe('queued');
		expect(job.attempts).toBe(0);
		expect(job.courseId).toBe('course_abc');
	});

	it('enqueues a module generation job and sets initial state', async () => {
		const job = await enqueueModuleGenerationJob({
			userId: 'user_123',
			courseId: 'course_abc',
			moduleId: 'mod_xyz'
		});

		expect(job.jobId).toContain('job_mod_mod_xyz');
		expect(job.jobType).toBe('module');
		expect(job.status).toBe('queued');
		expect(job.moduleId).toBe('mod_xyz');
	});

	it('updates and retrieves job status in Firestore', async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';

		const job = await enqueueGenerationJob({
			userId: 'user_456',
			courseId: 'course_def',
			topic: 'Algorithms'
		});

		await updateGenerationJobStatus(job.jobId, 'processing');
		let fetched = await getGenerationJobStatus(job.jobId);
		expect(fetched?.status).toBe('processing');

		await updateGenerationJobStatus(job.jobId, 'failed', 'AI service unavailable');
		fetched = await getGenerationJobStatus(job.jobId);
		expect(fetched?.status).toBe('failed');
		expect(fetched?.errorMessage).toBe('AI service unavailable');

		process.env.NODE_ENV = originalEnv;
	});

	it('reconciles stalled jobs by reclaiming unexpired jobs and dead-lettering expired jobs', async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';

		const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

		// Setup a stalled job with attempts < maxAttempts
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
			updatedAt: oldTimestamp
		};

		// Setup a stalled job that exceeded max attempts
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
			updatedAt: oldTimestamp
		};

		const { __mockJobs } = (await import('../admin')) as unknown as {
			__mockJobs: Map<string, Record<string, unknown>>;
		};
		__mockJobs.set(unexpiredJob.jobId, unexpiredJob as unknown as Record<string, unknown>);
		__mockJobs.set(deadJob.jobId, deadJob as unknown as Record<string, unknown>);

		const result = await reconcileStalledJobs(5 * 60 * 1000);

		expect(result.recoveredCount).toBe(1);
		expect(result.failedCount).toBe(1);

		process.env.NODE_ENV = originalEnv;
	});
});
