import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/ai/provider', () => ({
	generateOutline: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockTransaction = {
		get: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	};
	return {
		adminDb: {
			collection: vi.fn(() => ({
				doc: vi.fn(() => ({
					id: 'mock-course-id',
					get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
					collection: vi.fn(() => ({
						doc: vi.fn(() => ({ id: 'mock-module-id' }))
					}))
				}))
			})),
			runTransaction: vi.fn((cb) => {
				mockTransaction.get.mockResolvedValue({ exists: false, data: () => ({}) });
				return cb(mockTransaction);
			})
		},
		FieldValue: {
			increment: vi.fn((val) => val),
			serverTimestamp: vi.fn(() => 'MOCK_TS')
		}
	};
});

describe('POST /api/courses Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 Unauthorized when session verification fails', async () => {
		vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized: Missing header'));

		const request = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ topic: 'Valid Topic', moduleCount: 3, format: 'lessons_and_quizzes' })
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		const json = await response.json();

		expect(response.status).toBe(401);
		expect(json.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 400 Invalid Input when payload fails Zod validation', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

		const request = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ topic: 'ab', moduleCount: 10, format: 'invalid_format' })
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error.code).toBe('INVALID_INPUT');
	});

	it('returns 500 when AI outline generation fails', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
		vi.mocked(generateOutline).mockRejectedValue(new Error('AI generation timeout'));

		const request = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'Data Structures',
				moduleCount: 4,
				format: 'lessons_and_quizzes'
			})
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json.error.code).toBe('AI_GENERATION_FAILED');
	});

	it('returns 201 with courseId on successful creation', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
		vi.mocked(generateOutline).mockResolvedValue({
			result: {
				title: 'Data Structures 101',
				description: 'Learn arrays and linked lists',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Arrays',
						summary: 'Intro to arrays',
						learningObjective: 'Understand indexed memory',
						keyPoints: ['Indexing', 'Memory']
					},
					{
						order: 2,
						type: 'quiz',
						title: 'Arrays Quiz',
						summary: 'Quiz on arrays',
						learningObjective: 'Evaluate arrays knowledge',
						keyPoints: ['Review']
					},
					{
						order: 3,
						type: 'lesson',
						title: 'Linked Lists',
						summary: 'Intro to linked lists',
						learningObjective: 'Understand nodes and pointers',
						keyPoints: ['Nodes', 'Pointers']
					}
				]
			},
			provider: 'ml_backend'
		});

		const request = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'Data Structures',
				moduleCount: 3,
				format: 'lessons_and_quizzes'
			})
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.courseId).toBe('mock-course-id');
	});
});
