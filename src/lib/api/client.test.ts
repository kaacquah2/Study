import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from './client';

// Mock auth module
vi.mock('$lib/firebase/client', () => ({
	auth: {
		currentUser: {
			getIdToken: vi.fn().mockResolvedValue('mock-token-123')
		}
	}
}));

// Mock theme store
vi.mock('$lib/stores/theme.svelte', () => ({
	themeStore: {
		current: 'dark'
	}
}));

// Mock app navigation and environment
vi.mock('$app/environment', () => ({
	browser: true
}));

const mockGoto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => mockGoto(...args)
}));

interface QueuedResponse {
	queued: boolean;
	courseId: string;
}

describe('apiFetch client utility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		delete (global as Record<string, unknown>).window;
	});

	it('injects Authorization, theme, and timezone headers and returns wrapper', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ 'content-type': 'application/json' }),
			json: async () => ({ success: true })
		} as unknown as Response);

		const res = await apiFetch<{ success: boolean }>('/api/test');
		expect(res.data.success).toBe(true);
		expect(res.status).toBe(200);
		expect(res.ok).toBe(true);

		expect(global.fetch).toHaveBeenCalledWith('/api/test', {
			headers: expect.objectContaining({
				Authorization: 'Bearer mock-token-123',
				'X-Client-Theme': 'dark',
				'X-Client-Timezone': expect.any(String)
			}),
			signal: expect.anything()
		});
	});

	it('serializes JSON body automatically', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: async () => ({ id: '1' })
		} as unknown as Response);

		await apiFetch('/api/courses', {
			method: 'POST',
			body: { title: 'Test Course' }
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'/api/courses',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ title: 'Test Course' }),
				headers: expect.objectContaining({
					'Content-Type': 'application/json'
				})
			})
		);
	});

	it('throws structured ApiError on non-ok responses', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 429,
			headers: new Headers(),
			json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } })
		} as unknown as Response);

		await expect(apiFetch('/api/courses')).rejects.toThrow(ApiError);

		try {
			await apiFetch('/api/courses');
		} catch (err) {
			const apiErr = err as ApiError;
			expect(apiErr.status).toBe(429);
			expect(apiErr.code).toBe('RATE_LIMITED');
			expect(apiErr.message).toBe('Rate limit exceeded');
		}
	});

	it('handles 202 queued responses without mutating parsed response body', async () => {
		const rawPayload = { queued: true, courseId: 'abc-123' };
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 202,
			headers: new Headers(),
			json: async () => ({ ...rawPayload })
		} as unknown as Response);

		const res = await apiFetch<QueuedResponse>('/api/courses/generate-outline', { method: 'POST' });
		expect(res.data.queued).toBe(true);
		expect(res.data.courseId).toBe('abc-123');
		expect(res.status).toBe(202);
		expect((res.data as unknown as Record<string, unknown>)._status).toBeUndefined();
	});

	it('handles 204 No Content responses cleanly', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 204,
			headers: new Headers()
		} as unknown as Response);

		const res = await apiFetch('/api/items/1', { method: 'DELETE' });
		expect(res.status).toBe(204);
		expect(res.ok).toBe(true);
		expect(res.data).toBeUndefined();
	});

	it('combines custom signal and timeout', async () => {
		const abortController = new AbortController();
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: async () => ({ ok: true })
		} as unknown as Response);

		await apiFetch('/api/long-job', {
			signal: abortController.signal,
			timeout: 5000
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'/api/long-job',
			expect.objectContaining({
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('handles responseType: blob', async () => {
		const mockBlob = new Blob(['sample,data'], { type: 'text/csv' });
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ 'content-type': 'text/csv' }),
			blob: async () => mockBlob
		} as unknown as Response);

		const res = await apiFetch<Blob>('/api/export', { responseType: 'blob' });
		expect(res.ok).toBe(true);
		expect(res.data).toBe(mockBlob);
	});

	it('redirects to login on 401 when in browser and on protected route', async () => {
		(global as Record<string, unknown>).window = {
			location: {
				pathname: '/app/courses',
				search: '?id=123'
			}
		};

		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 401,
			headers: new Headers(),
			json: async () => ({ error: { message: 'Session expired' } })
		} as unknown as Response);

		await expect(apiFetch('/api/protected')).rejects.toThrow(ApiError);
		expect(mockGoto).toHaveBeenCalledWith('/?redirect=%2Fapp%2Fcourses%3Fid%3D123');
	});
});
