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

	describe('GET /api/documents', () => {
		it('returns 401 Unauthorized when session check fails', async () => {
			vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as any);

			expect(res.status).toBe(401);
		});

		it('returns 200 with RAG stats on successful proxy', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ chunk_count: 42, has_documents: true }), { status: 200 })
			);

			const req = new Request('http://localhost/api/documents', { method: 'GET' });
			const res = await GET({ request: req } as any);
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.chunk_count).toBe(42);
			expect(json.has_documents).toBe(true);
		});
	});

	describe('POST /api/documents', () => {
		it('returns 400 Invalid Input when texts is empty or invalid', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });

			const req = new Request('http://localhost/api/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ texts: [] })
			});
			const res = await POST({ request: req } as any);

			expect(res.status).toBe(400);
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
			const res = await POST({ request: req } as any);
			const json = await res.json();

			expect(res.status).toBe(201);
			expect(json.chunks_added).toBe(5);
		});
	});

	describe('DELETE /api/documents', () => {
		it('proxies DELETE request to clear vector store', async () => {
			vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user1' });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ status: 'ok', message: 'Cleared' }), { status: 200 })
			);

			const req = new Request('http://localhost/api/documents', { method: 'DELETE' });
			const res = await DELETE({ request: req } as any);
			const json = await res.json();

			expect(res.status).toBe(200);
			expect(json.status).toBe('ok');
		});
	});
});
