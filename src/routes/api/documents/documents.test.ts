import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './+server';
import { verifySessionUser } from '$lib/server/auth';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

// Global fetch mock for forwarding requests to Python ML backend
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('/api/documents RAG Proxy Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── GET /api/documents ────────────────────────────────────────────────────

	describe('GET /api/documents', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as unknown as Parameters<typeof GET>[0]);

			expect(res.status).toBe(401);
		});

		it('returns 200 with RAG stats on successful proxy', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ chunk_count: 42, has_documents: true }), { status: 200 })
			);

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as unknown as Parameters<typeof GET>[0]);
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.chunk_count).toBe(42);
			expect(json.has_documents).toBe(true);
		});

		it('returns 502 when ML backend returns non-200', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
			);

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as unknown as Parameters<typeof GET>[0]);
			const json = await res.json();

			expect(res.status).toBe(502);
			expect(json.error.code).toBe('ML_ERROR');
		});

		it('returns 500 when ML backend is unreachable', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as unknown as Parameters<typeof GET>[0]);
			const json = await res.json();

			expect(res.status).toBe(500);
			expect(json.error.code).toBe('SERVER_ERROR');
		});

		it('forwards X-User-ID header to ML backend', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user42' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ chunk_count: 0, has_documents: false }), { status: 200 })
			);

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			await GET({ request: req } as unknown as Parameters<typeof GET>[0]);

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [, fetchOptions] = mockFetch.mock.calls[0];
			expect(fetchOptions?.headers?.['X-User-ID']).toBe('user42');
		});
	});

	// ── POST /api/documents ───────────────────────────────────────────────────

	describe('POST /api/documents', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: ['some text'] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(401);
		});

		it('returns 400 Invalid Input when texts is empty array', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: [] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error.code).toBe('INVALID_INPUT');
		});

		it('returns 400 when texts is not an array', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: 'not-an-array' })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(400);
		});

		it('returns 400 when all texts are under 20 characters', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: ['short', 'too small', ''] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error.message).toContain('too short');
		});

		it('filters out short texts and forwards only valid ones', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ status: 'ok', chunks_added: 1 }), { status: 200 })
			);

			const validText =
				'This is a long enough document that contains more than twenty characters for processing.';
			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: ['too short', validText] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(201);
			// Verify the fetch was called with only the valid text
			const fetchBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(fetchBody.texts).toHaveLength(1);
			expect(fetchBody.texts[0]).toBe(validText);
		});

		it('returns 201 when valid documents are indexed', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ status: 'ok', chunks_added: 5 }), { status: 200 })
			);

			const validText =
				'This is a long test document containing more than twenty characters for RAG indexing.';
			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: [validText] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);
			const json = await res.json();

			expect(res.status).toBe(201);
			expect(json.chunks_added).toBe(5);
		});

		it('returns 502 when ML backend rejects the upload', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response('Bad Request: unsupported format', {
					status: 400,
					statusText: 'Bad Request'
				})
			);

			const validText =
				'This is a long test document containing more than twenty characters for testing.';
			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: [validText] })
			});
			const res = await POST({ request: req } as unknown as Parameters<typeof POST>[0]);

			expect(res.status).toBe(502);
		});
	});

	// ── DELETE /api/documents ──────────────────────────────────────────────────

	describe('DELETE /api/documents', () => {
		it('returns 401 when user is not authenticated', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/documents', { method: 'DELETE' });
			const res = await DELETE({ request: req } as unknown as Parameters<typeof DELETE>[0]);

			expect(res.status).toBe(401);
		});

		it('proxies DELETE request to clear vector store', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ status: 'ok', message: 'Cleared' }), { status: 200 })
			);

			const req = new Request('http://localhost/api/documents', { method: 'DELETE' });
			const res = await DELETE({ request: req } as unknown as Parameters<typeof DELETE>[0]);
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.status).toBe('ok');
		});

		it('returns 502 when ML backend returns error on clear', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

			const req = new Request('http://localhost/api/documents', { method: 'DELETE' });
			const res = await DELETE({ request: req } as unknown as Parameters<typeof DELETE>[0]);

			expect(res.status).toBe(502);
		});

		it('returns 500 when ML backend is unreachable', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

			const req = new Request('http://localhost/api/documents', { method: 'DELETE' });
			const res = await DELETE({ request: req } as unknown as Parameters<typeof DELETE>[0]);

			expect(res.status).toBe(500);
		});
	});
});
