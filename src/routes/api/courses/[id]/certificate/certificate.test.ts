import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as certificateHandler } from './+server';
import { verifySessionUser } from '$lib/server/auth';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

let mockCourseDocExists = true;
let mockCourseDocData: Record<string, unknown> = {
	ownerUid: 'user1',
	title: 'Complete Mastery Course',
	description: 'A full course',
	format: 'lessons_and_quizzes',
	moduleCount: 2,
	progress: {
		completed: 2
	}
};
const mockModuleDocs = [
	{
		data: () => ({
			order: 1,
			type: 'lesson' as const,
			title: 'Lesson 1',
			summary: 'Summary 1',
			status: 'ready',
			pages: [{ order: 1, heading: 'Page 1', body: 'Content 1' }],
			questions: null
		})
	},
	{
		data: () => ({
			order: 2,
			type: 'quiz' as const,
			title: 'Quiz 1',
			summary: 'Quiz summary',
			status: 'ready',
			pages: null,
			questions: [{ order: 1, prompt: 'Q1', options: ['A', 'B'], answerIndex: 0 }]
		})
	}
];
let mockExistingShares: Array<{ id: string; data: () => Record<string, unknown> }> = [];

vi.mock('$lib/server/admin', () => {
	return {
		adminDb: {
			collection: vi.fn((colName: string) => ({
				doc: vi.fn((docId?: string) => ({
					id: docId || 'mock-generated-id',
					get: vi.fn().mockImplementation(async () => {
						if (colName === 'users') {
							return {
								exists: true,
								data: () => ({ displayName: 'Alice Learner' })
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
					collection: vi.fn(() => ({
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
						limit: vi.fn(() => ({
							get: vi.fn().mockImplementation(async () => ({
								empty: mockExistingShares.length === 0,
								docs: mockExistingShares
							}))
						}))
					}))
				}))
			}))
		},
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
			increment: vi.fn((v: number) => v)
		}
	};
});

describe('GET /api/courses/[id]/certificate', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockCourseDocExists = true;
		mockCourseDocData = {
			ownerUid: 'user1',
			title: 'Complete Mastery Course',
			description: 'A full course',
			format: 'lessons_and_quizzes',
			moduleCount: 2,
			progress: { completed: 2 }
		};
		mockExistingShares = [];
	});

	it('returns 401 when user is unauthenticated', async () => {
		vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

		const req = new Request('http://localhost/api/courses/c1/certificate');
		const res = await certificateHandler({
			params: { id: 'c1' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 when course is not found', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1', email: 'user1@test.com' });
		mockCourseDocExists = false;

		const req = new Request('http://localhost/api/courses/nonexistent/certificate');
		const res = await certificateHandler({
			params: { id: 'nonexistent' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.error.code).toBe('NOT_FOUND');
	});

	it('returns 403 when requesting user does not own course', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'other_user', email: 'other@test.com' });

		const req = new Request('http://localhost/api/courses/c1/certificate');
		const res = await certificateHandler({
			params: { id: 'c1' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.error.code).toBe('FORBIDDEN');
	});

	it('returns 400 when course is not 100% complete', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1', email: 'user1@test.com' });
		mockCourseDocData.progress = { completed: 1 };
		mockCourseDocData.moduleCount = 3;

		const req = new Request('http://localhost/api/courses/c1/certificate');
		const res = await certificateHandler({
			params: { id: 'c1' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error.code).toBe('INCOMPLETE');
	});

	it('returns certificate with generated 32-character share URL when no active share exists', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1', email: 'user1@test.com' });

		const req = new Request('http://localhost:3000/api/courses/c1/certificate');
		const res = await certificateHandler({
			params: { id: 'c1' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.certificate).toBeDefined();
		expect(json.certificate.courseTitle).toBe('Complete Mastery Course');
		expect(json.certificate.shareUrl).toMatch(/^http:\/\/localhost:3000\/share\/[a-f0-9]{32}$/);
	});

	it('reuses existing active share token for shareUrl', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1', email: 'user1@test.com' });
		mockExistingShares = [
			{
				id: 'existing_token_12345678901234567890',
				data: () => ({ revoked: false })
			}
		];

		const req = new Request('http://localhost:3000/api/courses/c1/certificate');
		const res = await certificateHandler({
			params: { id: 'c1' },
			request: req
		} as unknown as Parameters<typeof certificateHandler>[0]);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.certificate.shareUrl).toBe(
			'http://localhost:3000/share/existing_token_12345678901234567890'
		);
	});
});
