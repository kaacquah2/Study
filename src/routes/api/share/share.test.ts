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

// Configurable mock data for simulating different Firestore states
let mockShareDocData: Record<string, unknown> | null = null;
let mockShareDocExists = true;
let mockCourseDocData: Record<string, unknown> = {
	ownerUid: 'user1',
	title: 'Shared Physics',
	description: 'Intro to Motion',
	format: 'lessons_and_quizzes'
};
let mockCourseDocExists = true;
let mockUserDisplayName = 'Alice';
let mockModuleDocs = [
	{
		data: () => ({
			order: 1,
			type: 'lesson' as const,
			title: 'Kinematics',
			summary: 'Velocity & Acceleration',
			status: 'ready',
			pages: [{ order: 1, heading: 'Velocity', body: 'Speed in a direction' }],
			questions: null
		})
	}
];
let mockClaimExists = false;
let transactionSetCalls: Array<Record<string, unknown>> = [];
let transactionUpdateCalls: Array<Record<string, unknown>> = [];

vi.mock('$lib/server/admin', () => {
	return {
		adminDb: {
			collection: vi.fn((colName: string) => ({
				doc: vi.fn((docId?: string) => ({
					id: docId || 'mock-generated-id',
					path: `${colName}/${docId || 'mock-generated-id'}`,
					ref: { path: `${colName}/${docId || 'mock-generated-id'}` },
					get: vi.fn().mockImplementation(async () => {
						if (colName === 'users') {
							return {
								exists: true,
								data: () => ({ displayName: mockUserDisplayName })
							};
						}
						if (colName === 'sharedCourses') {
							return {
								exists: mockShareDocExists,
								data: () => mockShareDocData
							};
						}
						if (colName === 'courses') {
							return {
								exists: mockCourseDocExists,
								data: () => mockCourseDocData
							};
						}
						return { exists: false, data: () => null };
					}),
					set: vi.fn().mockResolvedValue({}),
					collection: vi.fn((subCol: string) => ({
						doc: vi.fn((subDocId?: string) => ({
							id: subDocId || 'mock-subdoc-id',
							path: `${colName}/${docId || 'mock-doc'}/${subCol}/${subDocId || 'mock-subdoc'}`,
							get: vi.fn().mockResolvedValue({
								exists: mockClaimExists,
								data: () => (mockClaimExists ? { courseId: 'already-claimed-course' } : null)
							}),
							set: vi.fn()
						})),
						orderBy: vi.fn(() => ({
							get: vi.fn().mockResolvedValue({
								docs: mockModuleDocs,
								forEach: (cb: (doc: unknown) => void) => mockModuleDocs.forEach(cb)
							})
						}))
					}))
				})),
				where: vi.fn(() => ({
					where: vi.fn(() => ({
						get: vi.fn().mockResolvedValue({
							docs: [],
							forEach: (cb: (doc: unknown) => void) => [].forEach(cb)
						})
					}))
				}))
			})),
			batch: vi.fn(() => ({
				update: vi.fn(),
				commit: vi.fn().mockResolvedValue({})
			})),
			runTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
				transactionSetCalls = [];
				transactionUpdateCalls = [];
				const mockTx = {
					get: vi.fn().mockImplementation(async (ref: { path?: string }) => {
						const path = ref?.path || '';
						if (path.includes('claims')) {
							return {
								exists: mockClaimExists,
								data: () => (mockClaimExists ? { courseId: 'already-claimed-course' } : null)
							};
						}
						if (path.includes('sharedCourses')) {
							return {
								exists: mockShareDocExists,
								data: () => mockShareDocData
							};
						}
						return { exists: false, data: () => null };
					}),
					set: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
						transactionSetCalls.push(data);
					}),
					update: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
						transactionUpdateCalls.push(data);
					})
				};
				return cb(mockTx);
			})
		},
		FieldValue: {
			increment: vi.fn((v: number) => v),
			serverTimestamp: vi.fn(() => 'MOCK_TS')
		}
	};
});

describe('Course Sharing & Claiming API Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset to defaults
		mockShareDocExists = true;
		mockCourseDocExists = true;
		mockClaimExists = false;
		mockUserDisplayName = 'Alice';
		mockCourseDocData = {
			ownerUid: 'user1',
			title: 'Shared Physics',
			description: 'Intro to Motion',
			format: 'lessons_and_quizzes'
		};
		mockShareDocData = {
			token: 'abc123',
			courseId: 'course-1',
			sharedByUid: 'user1',
			sharedByName: 'Alice',
			revoked: false,
			snapshot: {
				title: 'Shared Physics',
				description: 'Intro to Motion',
				format: 'lessons_and_quizzes',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Kinematics',
						summary: 'Velocity & Acceleration',
						pages: [{ order: 1, heading: 'Velocity', body: 'Speed in a direction' }],
						questions: null
					}
				]
			}
		};
		mockModuleDocs = [
			{
				data: () => ({
					order: 1,
					type: 'lesson' as const,
					title: 'Kinematics',
					summary: 'Velocity & Acceleration',
					status: 'ready',
					pages: [{ order: 1, heading: 'Velocity', body: 'Speed in a direction' }],
					questions: null
				})
			}
		];
		transactionSetCalls = [];
		transactionUpdateCalls = [];
	});

	// ── POST /api/courses/[id]/share ──────────────────────────────────────────

	describe('POST /api/courses/[id]/share', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(401);
		});

		it('returns 404 when course does not exist', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockCourseDocExists = false;

			const req = new Request('http://localhost/api/courses/missing/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'missing' },
				url: new URL('http://localhost/api/courses/missing/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(404);
		});

		it('returns 403 when non-owner attempts to share', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'not-the-owner' });

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(403);
		});

		it('returns 400 when course has no completed modules', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockModuleDocs = [
				{
					data: () => ({
						order: 1,
						type: 'lesson' as const,
						title: 'Pending Module',
						summary: 'Not ready',
						status: 'pending',
						pages: [] as Array<{ order: number; heading: string; body: string }>,
						questions: null
					})
				}
			];

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error.code).toBe('INVALID_STATE');
		});

		it('returns 201 with share token, URL, and default isPublic=false on success', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'POST' });
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.token).toBeDefined();
			expect(typeof json.token).toBe('string');
			expect(json.token.length).toBe(32);
			expect(json.url).toContain('/share/');
			expect(json.isPublic).toBe(false);
		});

		it('returns 201 with isPublic=true when explicitly requested', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/courses/c1/share', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isPublic: true })
			});
			const res = await sharePostHandler({
				params: { id: 'c1' },
				url: new URL('http://localhost/api/courses/c1/share'),
				request: req
			} as unknown as Parameters<typeof sharePostHandler>[0]);

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.isPublic).toBe(true);
		});
	});

	// ── GET /api/share/[token] ────────────────────────────────────────────────

	describe('GET /api/share/[token]', () => {
		it('returns 429 when IP rate limit is exceeded', async () => {
			vi.mocked(enforceRateLimit).mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'));

			const res = await getSharePreviewHandler({
				params: { token: 't123' },
				getClientAddress: () => '127.0.0.1'
			} as unknown as Parameters<typeof getSharePreviewHandler>[0]);
			const json = await res.json();

			expect(res.status).toBe(429);
			expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
		});

		it('returns 404 when share token does not exist', async () => {
			vi.mocked(enforceRateLimit).mockResolvedValue(undefined);
			mockShareDocExists = false;

			const res = await getSharePreviewHandler({
				params: { token: 'nonexistent' },
				getClientAddress: () => '127.0.0.1'
			} as unknown as Parameters<typeof getSharePreviewHandler>[0]);

			expect(res.status).toBe(404);
		});

		it('returns 410 when share link is revoked', async () => {
			vi.mocked(enforceRateLimit).mockResolvedValue(undefined);
			mockShareDocData = { ...mockShareDocData, revoked: true };

			const res = await getSharePreviewHandler({
				params: { token: 'revoked-token' },
				getClientAddress: () => '127.0.0.1'
			} as unknown as Parameters<typeof getSharePreviewHandler>[0]);

			expect(res.status).toBe(410);
			const json = await res.json();
			expect(json.error.code).toBe('REVOKED');
		});

		it('returns 200 with course preview for valid token', async () => {
			vi.mocked(enforceRateLimit).mockResolvedValue(undefined);

			const res = await getSharePreviewHandler({
				params: { token: 'abc123' },
				getClientAddress: () => '127.0.0.1'
			} as unknown as Parameters<typeof getSharePreviewHandler>[0]);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.title).toBe('Shared Physics');
			expect(json.sharedByName).toBe('Alice');
			expect(json.moduleCount).toBe(1);
		});
	});

	// ── POST /api/share/[token]/claim ─────────────────────────────────────────

	describe('POST /api/share/[token]/claim', () => {
		it('returns 401 when claiming user is not authenticated', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/share/t123/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 't123' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(401);
		});

		it('returns 200 with isSelfClaim=true when owner claims own link', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			// sharedByUid matches claiming user
			mockShareDocData = { ...mockShareDocData, sharedByUid: 'user1' };

			const req = new Request('http://localhost/api/share/abc123/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 'abc123' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.isSelfClaim).toBe(true);
		});

		it('returns 200 with alreadyClaimed=true on duplicate claim', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user2' });
			mockClaimExists = true;

			const req = new Request('http://localhost/api/share/abc123/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 'abc123' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.alreadyClaimed).toBe(true);
			expect(json.courseId).toBe('already-claimed-course');
		});

		it('returns 404 when share link does not exist', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user2' });
			mockShareDocExists = false;
			mockShareDocData = null;

			const req = new Request('http://localhost/api/share/gone/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 'gone' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(404);
		});

		it('returns 410 when share link is revoked', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user2' });
			mockShareDocData = { ...mockShareDocData, revoked: true };

			const req = new Request('http://localhost/api/share/revoked/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 'revoked' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(410);
		});

		it('returns 201 with new courseId on successful clone', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user2' });
			// Different user from sharedByUid
			mockShareDocData = { ...mockShareDocData, sharedByUid: 'user1' };

			const req = new Request('http://localhost/api/share/abc123/claim', { method: 'POST' });
			const res = await claimShareHandler({
				params: { token: 'abc123' },
				request: req
			} as unknown as Parameters<typeof claimShareHandler>[0]);

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.courseId).toBeDefined();
			expect(json.isSelfClaim).toBe(false);
			expect(json.alreadyClaimed).toBe(false);
		});
	});

	// ── DELETE /api/courses/[id]/share ─────────────────────────────────────────

	describe('DELETE /api/courses/[id]/share', () => {
		it('returns 401 when user is unauthenticated', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'DELETE' });
			const res = await shareDeleteHandler({
				params: { id: 'c1' },
				request: req
			} as unknown as Parameters<typeof shareDeleteHandler>[0]);

			expect(res.status).toBe(401);
		});

		it('returns 404 when course does not exist', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockCourseDocExists = false;

			const req = new Request('http://localhost/api/courses/missing/share', { method: 'DELETE' });
			const res = await shareDeleteHandler({
				params: { id: 'missing' },
				request: req
			} as unknown as Parameters<typeof shareDeleteHandler>[0]);

			expect(res.status).toBe(404);
		});

		it('returns 403 when non-owner attempts revocation', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'not-owner' });

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'DELETE' });
			const res = await shareDeleteHandler({
				params: { id: 'c1' },
				request: req
			} as unknown as Parameters<typeof shareDeleteHandler>[0]);

			expect(res.status).toBe(403);
		});

		it('returns 204 on successful revocation', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/courses/c1/share', { method: 'DELETE' });
			const res = await shareDeleteHandler({
				params: { id: 'c1' },
				request: req
			} as unknown as Parameters<typeof shareDeleteHandler>[0]);

			expect(res.status).toBe(204);
		});
	});
});
