import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as chatHandler } from './chat/stream/+server';
import { POST as summarizeHandler } from './summarize/+server';
import { POST as paraphraseHandler } from './paraphrase/+server';
import { verifySessionUser } from '$lib/server/auth';
import { chat, summarize, paraphrase } from '$lib/server/ai/provider';
import { enforceRateLimit } from '$lib/server/rateLimiter';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/ai/provider', () => ({
	chat: vi.fn(),
	streamChat: vi.fn(),
	summarize: vi.fn(),
	paraphrase: vi.fn()
}));

vi.mock('$lib/server/rateLimiter', () => ({
	enforceRateLimit: vi.fn()
}));

vi.mock('$lib/server/admin', () => ({
	adminDb: {
		collection: vi.fn(() => ({
			doc: vi.fn(() => ({}))
		}))
	}
}));

function mockEvent<T>(request: Request): T {
	return { request } as unknown as T;
}

describe('Microservices API Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/chat', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized: Invalid token'));

			const req = new Request('http://localhost/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
			});

			const res = await chatHandler(mockEvent<Parameters<typeof chatHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(401);
			expect(json.error.code).toBe('UNAUTHORIZED');
		});

		it('returns 400 Invalid Input for empty messages array', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: [] })
			});

			const res = await chatHandler(mockEvent<Parameters<typeof chatHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(400);
			expect(json.error.code).toBe('INVALID_INPUT');
		});

		it('returns 200 with chat reply on success', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			vi.mocked(chat).mockResolvedValue({
				result: { reply: 'Here is your study answer.', sources: [] },
				provider: 'ml_backend'
			});

			const req = new Request('http://localhost/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: [{ role: 'user', content: 'What is recursion?' }] })
			});

			const res = await chatHandler(mockEvent<Parameters<typeof chatHandler>[0]>(req));
			const text = await res.text();

			expect(res.status).toBe(200);
			expect(res.headers.get('Content-Type')).toBe('text/event-stream');
			expect(text).toContain('"type":"delta"');
			expect(text).toContain('"type":"done"');
		});

		it('returns 503 MODEL_WARMING_UP when ML model is warming up', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			const { MLBackendError } = await import('$lib/server/ai/client');
			vi.mocked(chat).mockRejectedValue(new MLBackendError('Warming up', 503, '/chat'));

			const req = new Request('http://localhost/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: [{ role: 'user', content: 'What is a binary tree?' }] })
			});

			const res = await chatHandler(mockEvent<Parameters<typeof chatHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(503);
			expect(json.error.code).toBe('MODEL_WARMING_UP');
		});
	});

	describe('POST /api/summarize', () => {
		it('returns 400 for text under 50 characters minimum length', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'Too short' })
			});

			const res = await summarizeHandler(mockEvent<Parameters<typeof summarizeHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(400);
			expect(json.error.code).toBe('INVALID_INPUT');
		});

		it('returns 200 with summary text when input text is valid', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			vi.mocked(summarize).mockResolvedValue({
				result: 'Condensed study summary.',
				provider: 'ml_backend'
			});

			const longText =
				'This is a sufficiently long text payload that exceeds the fifty character minimum length threshold required by the summarize API schema.';

			const req = new Request('http://localhost/api/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: longText })
			});

			const res = await summarizeHandler(mockEvent<Parameters<typeof summarizeHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.summary).toBe('Condensed study summary.');
		});
	});

	describe('POST /api/paraphrase', () => {
		it('returns 200 with paraphrased result for valid style', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			vi.mocked(paraphrase).mockResolvedValue({
				result: 'Academic restructured sentence.',
				provider: 'ml_backend'
			});

			const req = new Request('http://localhost/api/paraphrase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'This text needs rewording for my paper.', style: 'academic' })
			});

			const res = await paraphraseHandler(mockEvent<Parameters<typeof paraphraseHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.paraphrase).toBe('Academic restructured sentence.');
		});

		it('returns 429 when rate limit is exceeded', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			vi.mocked(enforceRateLimit).mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'));

			const req = new Request('http://localhost/api/paraphrase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'This text will be rate limited by system.' })
			});

			const res = await paraphraseHandler(mockEvent<Parameters<typeof paraphraseHandler>[0]>(req));
			const json = await res.json();

			expect(res.status).toBe(429);
			expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
		});
	});
});
