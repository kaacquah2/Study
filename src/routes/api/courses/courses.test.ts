import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, _sanitizePromptInput as sanitizePromptInput } from './+server';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';

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

	it('preserves HTML/XML tags and chat role terminology in course creation', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
		vi.mocked(generateOutline).mockResolvedValue({
			result: {
				title: 'HTML & XML Basics',
				description: 'Overview',
				modules: []
			},
			provider: 'gemini'
		});

		const legitimateTopic = 'Building with <header> and <footer>: system: and user: roles';
		const request = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: legitimateTopic,
				moduleCount: 3,
				format: 'lessons_and_quizzes'
			})
		});

		const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
		expect(response.status).toBe(201);
		// Verify generateOutline received the clean topic with tags intact, not stripped
		expect(vi.mocked(generateOutline)).toHaveBeenCalledWith(
			legitimateTopic,
			3,
			'lessons_and_quizzes',
			undefined,
			'user1'
		);
	});
});

describe('sanitizePromptInput', () => {
	it('strips control characters while keeping valid text', () => {
		const inputWithControlChars = 'Hello\u0000World\u0007\u001F!';
		expect(sanitizePromptInput(inputWithControlChars)).toBe('HelloWorld!');
	});

	it('does NOT strip HTML or XML tags from legitimate CS content', () => {
		const htmlTopic = 'Mastering <header> and <footer> tags in modern HTML5 & XML';
		expect(sanitizePromptInput(htmlTopic)).toBe(htmlTopic);
	});

	it('does NOT strip chat role keywords (system:, user:, assistant:)', () => {
		const chatRolesTopic = 'Understanding the system: and user: roles in LLM API design';
		expect(sanitizePromptInput(chatRolesTopic)).toBe(chatRolesTopic);
	});

	it('does NOT corrupt phrases with instruction wording', () => {
		const instructionTopic = 'How neural nets learn to ignore previous weights during fine-tuning';
		expect(sanitizePromptInput(instructionTopic)).toBe(instructionTopic);
	});

	it('returns undefined for empty or undefined input', () => {
		expect(sanitizePromptInput(undefined)).toBeUndefined();
		expect(sanitizePromptInput('')).toBeUndefined();
	});
});
