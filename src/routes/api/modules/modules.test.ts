import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as completeModuleHandler } from './[id]/complete/+server';
import { POST as generateModuleHandler } from './[id]/generate/+server';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb } from '$lib/server/admin';
import { enqueueModuleGenerationJob } from '$lib/server/ai/generationQueue';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/ai/generationQueue', () => ({
	enqueueModuleGenerationJob: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockTransaction = {
		get: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	};
	const mockDoc = {
		set: vi.fn().mockResolvedValue(undefined),
		update: vi.fn().mockResolvedValue(undefined),
		collection: vi.fn(() => ({
			doc: vi.fn(() => ({
				set: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined)
			})),
			orderBy: vi.fn(() => ({
				get: vi.fn().mockResolvedValue({ docs: [] })
			})),
			get: vi.fn().mockResolvedValue({ docs: [] })
		}))
	};
	return {
		adminDb: {
			collection: vi.fn(() => ({
				doc: vi.fn(() => mockDoc)
			})),
			runTransaction: vi.fn((cb) => cb(mockTransaction))
		},
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_TS')
		}
	};
});

describe('/api/modules/[id] Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/modules/[id]/complete', () => {
		it('returns 400 when missing courseId in body', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const request = new Request('http://localhost/api/modules/mod1/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const response = await completeModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof completeModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(400);
			expect(json.error.code).toBe('INVALID_INPUT');
		});

		it('returns 403 FORBIDDEN when user is not the owner of the course', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					// Course doc check
					return Promise.resolve({
						exists: true,
						data: () => ({ ownerUid: 'other_user' })
					});
				})
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			const request = new Request('http://localhost/api/modules/mod1/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: 'c1' })
			});

			const response = await completeModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof completeModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(403);
			expect(json.error.code).toBe('FORBIDDEN');
		});

		it('returns 200 with updated streak on successful completion', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const now = new Date();
			const yesterdayDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: 'Africa/Accra',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			const parts = formatter.formatToParts(yesterdayDateObj);
			const yYear = parts.find((p) => p.type === 'year')?.value;
			const yMonth = parts.find((p) => p.type === 'month')?.value;
			const yDay = parts.find((p) => p.type === 'day')?.value;
			const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;

			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							streak: { current: 1, longest: 1, lastStudiedOn: yesterdayStr },
							completedModuleIds: []
						})
					});
				}),
				update: vi.fn(),
				set: vi.fn()
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			const request = new Request('http://localhost/api/modules/mod1/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: 'c1', timezone: 'Africa/Accra' })
			});

			const response = await completeModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof completeModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.streak).toBeDefined();
			expect(json.streak.current).toBe(2);
			expect(json.streak.extended).toBe(true);
		});
	});

	describe('POST /api/modules/[id]/generate', () => {
		it('returns 400 when missing courseId payload', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const request = new Request('http://localhost/api/modules/mod1/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const response = await generateModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof generateModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(400);
			expect(json.error.code).toBe('INVALID_INPUT');
		});

		it('returns 404 when course is not found in database', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({ exists: false });
				})
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			const request = new Request('http://localhost/api/modules/mod1/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: 'nonexistent' })
			});

			const response = await generateModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof generateModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(404);
			expect(json.error.code).toBe('NOT_FOUND');
		});

		it('returns 429 when hourly module generation limit is reached', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const hourStr = Math.floor(Date.now() / 3600000).toString();
			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							modulesThisHour: 30,
							hour: hourStr
						})
					});
				}),
				set: vi.fn()
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			const request = new Request('http://localhost/api/modules/mod1/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: 'c1' })
			});

			const response = await generateModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof generateModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(429);
			expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
		});

		it('successfully enqueues module generation into the durable queue and returns 202 Accepted', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							status: 'pending',
							type: 'lesson',
							title: 'Variables',
							modulesThisHour: 2,
							hour: Math.floor(Date.now() / 3600000).toString()
						})
					});
				}),
				set: vi.fn()
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			vi.mocked(enqueueModuleGenerationJob).mockResolvedValue({
				jobId: 'job_mod_mod1_123',
				jobType: 'module',
				userId: 'user1',
				courseId: 'c1',
				moduleId: 'mod1',
				status: 'queued',
				attempts: 0,
				maxAttempts: 3,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const request = new Request('http://localhost/api/modules/mod1/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ courseId: 'c1' })
			});

			const response = await generateModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof generateModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(202);
			expect(json.status).toBe('queued');
			expect(json.jobId).toBe('job_mod_mod1_123');
			expect(enqueueModuleGenerationJob).toHaveBeenCalledWith({
				courseId: 'c1',
				moduleId: 'mod1',
				userId: 'user1'
			});
		});
	});
});
