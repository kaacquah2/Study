import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	POST as sharePostHandler,
	DELETE as shareDeleteHandler
} from '../courses/[id]/share/+server';
import { GET as getSharePreviewHandler } from './[token]/+server';
import { POST as claimShareHandler } from './[token]/claim/+server';
import { verifySessionUser } from '$lib/server/auth';
import { enforceRateLimit } from '$lib/server/rateLimiter';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/rateLimiter', () => ({
	enforceRateLimit: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockCourseData = {
		ownerUid: 'user1',
		title: 'Shared Physics',
		description: 'Intro to Motion',
		format: 'lessons_and_quizzes'
	};
	const mockModuleDoc = {
		data: () => ({
			order: 1,
			type: 'lesson',
			title: 'Kinematics',
			summary: 'Velocity & Acceleration',
			status: 'ready',
			pages: [{ order: 1, heading: 'Velocity', body: 'Speed in a direction' }]
		})
	};
	return {
		adminDb: {
			collection: vi.fn((colName: string) => ({
				doc: vi.fn((docId?: string) => ({
					id: docId || 'mock-share-token',
					get: vi.fn().mockResolvedValue({
						exists: true,
						data: () => (colName === 'users' ? { displayName: 'Alice' } : mockCourseData)
					}),
					set: vi.fn().mockResolvedValue({}),
					collection: vi.fn(() => ({
						doc: vi.fn(() => ({ id: 'mock-subdoc-id' })),
						orderBy: vi.fn(() => ({
							get: vi.fn().mockResolvedValue([mockModuleDoc])
						}))
					}))
				})),
				where: vi.fn(() => ({
					where: vi.fn(() => ({
						get: vi.fn().mockResolvedValue([])
					}))
				}))
			})),
			batch: vi.fn(() => ({
				update: vi.fn(),
				commit: vi.fn().mockResolvedValue({})
			})),
			runTransaction: vi.fn((cb) =>
				cb({
					get: vi.fn().mockResolvedValue({
						exists: false,
						data: () => ({})
					}),
					set: vi.fn(),
					update: vi.fn()
				})
			)
		},
		FieldValue: {
			increment: vi.fn((v) => v),
			serverTimestamp: vi.fn(() => 'MOCK_TS')
		}
	};
});

describe('Course Sharing & Claiming API Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/courses/[id]/share', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as any);

			expect(res.status).toBe(401);
		});
	});

	describe('GET /api/share/[token]', () => {
		it('calls rate limiter and returns rate limit error when exceeded', async () => {
			vi.mocked(enforceRateLimit).mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'));

			const res = await getSharePreviewHandler({
				params: { token: 't123' },
				getClientAddress: () => '127.0.0.1'
			} as any);
			const json = await res.json();

			expect(res.status).toBe(429);
			expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
		});
	});

	describe('POST /api/share/[token]/claim', () => {
		it('returns 401 Unauthorized when claiming user is not authenticated', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/share/t123/claim', { method: 'POST' });
			const res = await claimShareHandler({ params: { token: 't123' }, request: req } as any);

			expect(res.status).toBe(401);
		});
	});
});
