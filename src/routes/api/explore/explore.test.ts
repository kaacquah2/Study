import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as exploreHandler } from './+server';
import { verifySessionUser } from '$lib/server/auth';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

const mockDocs = [
	{
		id: 'public-course-1',
		data: () => ({
			token: 'public-course-1',
			isPublic: true,
			revoked: false,
			sharedByName: 'Alice',
			isOfficial: true,
			claimCount: 50,
			importCount: 50,
			tags: ['AI', 'Python'],
			level: 'beginner',
			snapshot: {
				title: 'Intro to AI',
				description: 'A beginner AI course',
				format: 'lessons_and_quizzes',
				modules: [
					{ order: 1, type: 'lesson', title: 'Mod 1', pages: [{ body: 'Secret markdown content' }] }
				]
			}
		})
	},
	{
		id: 'public-course-2',
		data: () => ({
			token: 'public-course-2',
			isPublic: true,
			revoked: false,
			sharedByName: 'Bob',
			isOfficial: false,
			claimCount: 120,
			importCount: 120,
			tags: ['Math', 'Calculus'],
			level: 'advanced',
			snapshot: {
				title: 'Advanced Calculus',
				description: 'Deep dive into multivariable calculus',
				format: 'lessons_and_quizzes',
				modules: [
					{ order: 1, type: 'lesson', title: 'Limits', pages: [] },
					{ order: 2, type: 'quiz', title: 'Quiz 1', questions: [{ question: 'Q1' }] }
				]
			}
		})
	}
];

vi.mock('$lib/server/admin', () => ({
	adminDb: {
		collection: vi.fn(() => ({
			where: vi.fn(() => ({
				where: vi.fn(() => ({
					get: vi.fn().mockResolvedValue({
						forEach: (cb: (doc: unknown) => void) => mockDocs.forEach(cb)
					})
				}))
			}))
		}))
	}
}));

describe('GET /api/explore Endpoint Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when session verification fails', async () => {
		vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

		const req = new Request('http://localhost/api/explore');
		const res = await exploreHandler({
			url: new URL('http://localhost/api/explore'),
			request: req
		} as unknown as Parameters<typeof exploreHandler>[0]);

		expect(res.status).toBe(401);
	});

	it('returns lightweight previews and never leaks full snapshot modules payload', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user123' });

		const req = new Request('http://localhost/api/explore');
		const res = await exploreHandler({
			url: new URL('http://localhost/api/explore'),
			request: req
		} as unknown as Parameters<typeof exploreHandler>[0]);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.courses).toHaveLength(2);
		expect(json.total).toBe(2);

		// Verify preview structure (does not leak raw module pages/questions)
		const course = json.courses[0];
		expect(course.id).toBe('public-course-1');
		expect(course.title).toBe('Intro to AI');
		expect(course.sharedByName).toBe('Alice');
		expect(course.moduleCount).toBe(1);
		expect(course.snapshot).toBeUndefined(); // Crucial: snapshot is stripped
		expect(course.modules).toBeUndefined();

		expect(json.availableTags).toContain('AI');
		expect(json.availableTags).toContain('Math');
	});

	it('filters courses by tag', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user123' });

		const req = new Request('http://localhost/api/explore?tag=Math');
		const res = await exploreHandler({
			url: new URL('http://localhost/api/explore?tag=Math'),
			request: req
		} as unknown as Parameters<typeof exploreHandler>[0]);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.courses).toHaveLength(1);
		expect(json.courses[0].id).toBe('public-course-2');
	});

	it('filters courses by search query', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user123' });

		const req = new Request('http://localhost/api/explore?search=calculus');
		const res = await exploreHandler({
			url: new URL('http://localhost/api/explore?search=calculus'),
			request: req
		} as unknown as Parameters<typeof exploreHandler>[0]);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.courses).toHaveLength(1);
		expect(json.courses[0].title).toBe('Advanced Calculus');
	});
});
