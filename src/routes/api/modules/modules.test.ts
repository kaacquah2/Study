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

		it('consumes a freeze and preserves streak when user missed exactly one day (dayBeforeYesterday)', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: 'Africa/Accra',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			const parts = formatter.formatToParts(new Date());
			const year = Number(parts.find((p) => p.type === 'year')?.value);
			const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
			const day = Number(parts.find((p) => p.type === 'day')?.value);

			const localMidday = new Date(Date.UTC(year, month, day, 12, 0, 0));
			localMidday.setUTCDate(localMidday.getUTCDate() - 2); // 2 days ago

			const pParts = formatter.formatToParts(localMidday);
			const pYear = pParts.find((p) => p.type === 'year')?.value;
			const pMonth = pParts.find((p) => p.type === 'month')?.value;
			const pDay = pParts.find((p) => p.type === 'day')?.value;
			const dayBeforeYesterdayStr = `${pYear}-${pMonth}-${pDay}`;

			const mockUpdate = vi.fn();
			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							streak: {
								current: 5,
								longest: 5,
								lastStudiedOn: dayBeforeYesterdayStr,
								freezesAvailable: 1
							},
							completedModuleIds: []
						})
					});
				}),
				update: mockUpdate,
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
			expect(json.streak.current).toBe(6);
			expect(json.streak.extended).toBe(true);
			expect(json.streak.freezeUsed).toBe(true);
			expect(json.streak.freezesAvailable).toBe(0);
			expect(mockUpdate).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					'streak.current': 6,
					'streak.freezesAvailable': 0
				})
			);
		});

		it('resets streak to 1 and does not consume freeze when gap is greater than 1 missed day (e.g. 6 months ago)', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockUpdate = vi.fn();
			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							streak: {
								current: 50,
								longest: 50,
								lastStudiedOn: '2025-01-01', // 6+ months gap
								freezesAvailable: 1
							},
							completedModuleIds: []
						})
					});
				}),
				update: mockUpdate,
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
			expect(json.streak.current).toBe(1);
			expect(json.streak.extended).toBe(true);
			expect(json.streak.freezeUsed).toBe(false);
			expect(json.streak.freezesAvailable).toBe(1); // Freeze is NOT consumed for multi-day gap
			expect(mockUpdate).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					'streak.current': 1,
					'streak.freezesAvailable': 1
				})
			);
		});

		it('replenishes streak freezes weekly when 7+ days have elapsed since last refill', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockUpdate = vi.fn();
			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							streak: {
								current: 0,
								longest: 0,
								lastStudiedOn: null,
								freezesAvailable: 0,
								lastFreezeRefill: '2026-01-01' // Long ago
							},
							completedModuleIds: []
						})
					});
				}),
				update: mockUpdate,
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
			expect(json.streak.freezesAvailable).toBe(2); // Refilled to MAX_FREEZES (2)
			expect(mockUpdate).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					'streak.freezesAvailable': 2
				})
			);
		});

		it('authoritatively grades quiz answers server-side against module document and records quiz attempt', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockSet = vi.fn();
			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					// Course doc or module doc or user doc or progress doc
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							type: 'quiz',
							questions: [
								{
									prompt: 'What is 2+2?',
									options: ['3', '4', '5'],
									correctIndex: 1,
									explanation: '2+2 is 4'
								},
								{
									prompt: 'What is 3+3?',
									options: ['6', '7', '8'],
									answerIndex: 0,
									explanation: '3+3 is 6'
								}
							],
							streak: { current: 1, longest: 1, lastStudiedOn: '2026-01-01' },
							completedModuleIds: []
						})
					});
				}),
				update: vi.fn(),
				set: mockSet
			};

			vi.mocked(adminDb.runTransaction).mockImplementation(async (cb) =>
				cb(mockTransaction as never)
			);

			// User selects [1, 2] -> Q1 is correct (1), Q2 is wrong (chose 2, correct is 0)
			const request = new Request('http://localhost/api/modules/mod1/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId: 'c1',
					timezone: 'Africa/Accra',
					answers: [1, 2]
				})
			});

			const response = await completeModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof completeModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(200);
			expect(json.quizResult).toBeDefined();
			expect(json.quizResult.score).toBe(1);
			expect(json.quizResult.total).toBe(2);
			expect(json.quizResult.accuracy).toBe(50);
			expect(json.quizResult.reviewItems).toHaveLength(2);
			expect(json.quizResult.reviewItems[0].isCorrect).toBe(true);
			expect(json.quizResult.reviewItems[1].isCorrect).toBe(false);

			// Verify quiz attempt was saved in transaction
			expect(mockSet).toHaveBeenCalled();
		});

		it('returns 400 with ANSWER_COUNT_MISMATCH when answers length does not match questions length', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const mockTransaction = {
				get: vi.fn().mockImplementation(() => {
					return Promise.resolve({
						exists: true,
						data: () => ({
							ownerUid: 'user1',
							type: 'quiz',
							questions: [
								{ prompt: 'Q1', options: ['A', 'B'], correctIndex: 0 },
								{ prompt: 'Q2', options: ['C', 'D'], correctIndex: 1 }
							],
							streak: { current: 1, longest: 1, lastStudiedOn: '2026-01-01' },
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

			// Provided only 1 answer for a 2-question quiz
			const request = new Request('http://localhost/api/modules/mod1/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId: 'c1',
					answers: [0]
				})
			});

			const response = await completeModuleHandler({
				params: { id: 'mod1' },
				request
			} as unknown as Parameters<typeof completeModuleHandler>[0]);
			const json = await response.json();

			expect(response.status).toBe(400);
			expect(json.error.code).toBe('ANSWER_COUNT_MISMATCH');
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
