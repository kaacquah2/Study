import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from './+server';
import { verifySessionUser } from '$lib/server/auth';
import {
	recordMistake,
	getUserMistakes,
	type MistakeRecord
} from '$lib/server/analytics/mistakeRecords';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

let mockMistakesDb: Record<string, MistakeRecord> = {};
let shouldSimulateIndexError = false;

vi.mock('$lib/server/admin', () => {
	return {
		adminDb: {
			collection: vi.fn((colName: string) => {
				if (colName === 'mistakeRecords') {
					return {
						doc: vi.fn(() => ({
							collection: vi.fn((subCol: string) => {
								if (subCol === 'mistakes') {
									const createQueryMock = (isChained = false) => ({
										doc: vi.fn((docId: string) => ({
											get: vi.fn().mockImplementation(async () => {
												const doc = mockMistakesDb[docId];
												return {
													exists: Boolean(doc),
													data: () => doc
												};
											}),
											set: vi.fn().mockImplementation(async (data: MistakeRecord) => {
												mockMistakesDb[docId] = data;
											}),
											update: vi.fn().mockImplementation(async (data: Partial<MistakeRecord>) => {
												if (mockMistakesDb[docId]) {
													mockMistakesDb[docId] = { ...mockMistakesDb[docId], ...data };
												}
											})
										})),
										where: vi.fn().mockImplementation(() => createQueryMock(true)),
										orderBy: vi.fn().mockImplementation(() => createQueryMock(true)),
										limit: vi.fn().mockImplementation(() => createQueryMock(true)),
										get: vi.fn().mockImplementation(async () => {
											if (shouldSimulateIndexError && isChained) {
												throw new Error('9 FAILED_PRECONDITION: The query requires an index.');
											}
											return {
												docs: Object.values(mockMistakesDb).map((val) => ({
													data: () => val
												}))
											};
										})
									});
									return createQueryMock(false);
								}
								return {};
							})
						}))
					};
				}
				return {};
			})
		},
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP')
		}
	};
});

describe('Mistake Notebook API & Backend Analytics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		shouldSimulateIndexError = false;
		mockMistakesDb = {
			q1: {
				mistakeId: 'q1',
				userId: 'user_123',
				questionId: 'q1',
				questionSnapshot: {
					prompt: 'What is photosynthesis?',
					options: ['Plant energy process', 'Cell division', 'Animal digestion'],
					correctIndex: 0,
					explanation: 'Plants convert sunlight into chemical energy.'
				},
				selectedIndex: 1,
				mistakeCount: 2,
				firstMistakeAt: '2026-09-01T10:00:00Z',
				lastMistakeAt: '2026-09-02T10:00:00Z',
				resolved: false
			},
			q2: {
				mistakeId: 'q2',
				userId: 'user_123',
				questionId: 'q2',
				questionSnapshot: {
					prompt: 'What is mitosis?',
					options: ['Cell division', 'Respiration', 'Digestion'],
					correctIndex: 0,
					explanation: 'Mitosis is the process of nuclear cell division.'
				},
				selectedIndex: 2,
				mistakeCount: 1,
				firstMistakeAt: '2026-09-01T12:00:00Z',
				lastMistakeAt: '2026-09-01T12:00:00Z',
				resolved: true
			}
		};
	});

	describe('GET /api/analytics/mistakes', () => {
		it('returns 401 when Authorization is missing or malformed', async () => {
			vi.mocked(verifySessionUser).mockRejectedValueOnce(
				new Error('Unauthorized: Missing or malformed Authorization header')
			);

			const request = new Request('http://localhost/api/analytics/mistakes');
			const url = new URL(request.url);

			const response = await GET({
				request,
				url
			} as unknown as Parameters<typeof GET>[0]);
			expect(response.status).toBe(401);

			const body = await response.json();
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('returns mistakes list for authenticated user', async () => {
			vi.mocked(verifySessionUser).mockResolvedValueOnce({
				uid: 'user_123',
				email: 'test@example.com'
			});

			const request = new Request('http://localhost/api/analytics/mistakes?resolved=false');
			const url = new URL(request.url);

			const response = await GET({
				request,
				url
			} as unknown as Parameters<typeof GET>[0]);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.mistakes).toBeDefined();
			expect(Array.isArray(body.mistakes)).toBe(true);
		});
	});

	describe('PATCH /api/analytics/mistakes', () => {
		it('returns 401 when user is unauthorized', async () => {
			vi.mocked(verifySessionUser).mockRejectedValueOnce(
				new Error('Unauthorized: Invalid ID token')
			);

			const request = new Request('http://localhost/api/analytics/mistakes', {
				method: 'PATCH',
				body: JSON.stringify({ questionId: 'q1' })
			});

			const response = await PATCH({
				request
			} as unknown as Parameters<typeof PATCH>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 400 when questionId is missing', async () => {
			vi.mocked(verifySessionUser).mockResolvedValueOnce({
				uid: 'user_123',
				email: 'test@example.com'
			});

			const request = new Request('http://localhost/api/analytics/mistakes', {
				method: 'PATCH',
				body: JSON.stringify({})
			});

			const response = await PATCH({
				request
			} as unknown as Parameters<typeof PATCH>[0]);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error.code).toBe('MISSING_PARAM');
		});

		it('resolves a mistake when questionId is provided', async () => {
			vi.mocked(verifySessionUser).mockResolvedValueOnce({
				uid: 'user_123',
				email: 'test@example.com'
			});

			const request = new Request('http://localhost/api/analytics/mistakes', {
				method: 'PATCH',
				body: JSON.stringify({ questionId: 'q1' })
			});

			const response = await PATCH({
				request
			} as unknown as Parameters<typeof PATCH>[0]);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockMistakesDb.q1.resolved).toBe(true);
		});
	});

	describe('getUserMistakes fallback resilience', () => {
		it('falls back to in-memory filter and sort if Firestore throws composite index error', async () => {
			shouldSimulateIndexError = true;

			const result = await getUserMistakes('user_123', { resolved: false });
			expect(result).toBeDefined();
			expect(result.length).toBe(1);
			expect(result[0].questionId).toBe('q1');
			expect(result[0].resolved).toBe(false);
		});

		it('records and updates mistakes accurately', async () => {
			await recordMistake(
				'user_123',
				'q3',
				{
					prompt: 'New Question',
					options: ['A', 'B'],
					correctIndex: 0,
					explanation: 'Explanation'
				},
				1,
				{ moduleId: 'm1' }
			);

			expect(mockMistakesDb.q3).toBeDefined();
			expect(mockMistakesDb.q3.mistakeCount).toBe(1);
			expect(mockMistakesDb.q3.resolved).toBe(false);

			// Re-recording same mistake increments counter
			await recordMistake(
				'user_123',
				'q3',
				{
					prompt: 'New Question',
					options: ['A', 'B'],
					correctIndex: 0,
					explanation: 'Explanation'
				},
				1
			);

			expect(mockMistakesDb.q3.mistakeCount).toBe(2);
		});
	});
});
