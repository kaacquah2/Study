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

interface QueuedResponse {
	queued: boolean;
	courseId: string;
	_status?: number;
}

describe('apiFetch client utility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('injects Authorization, theme, and timezone headers', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ success: true })
		} as Response);

		const res = await apiFetch<{ success: boolean }>('/api/test');
		expect(res.success).toBe(true);

		expect(global.fetch).toHaveBeenCalledWith('/api/test', {
			headers: expect.objectContaining({
				Authorization: 'Bearer mock-token-123',
				'X-Client-Theme': 'dark',
				'X-Client-Timezone': expect.any(String)
			})
		});
	});

	it('serializes JSON body automatically', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: '1' })
		} as Response);

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
			json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } })
		} as Response);

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

	it('handles 202 queued responses correctly', async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 202,
			json: async () => ({ queued: true, courseId: 'abc-123' })
		} as Response);

		const res = await apiFetch<QueuedResponse>('/api/courses/generate-outline', { method: 'POST' });
		expect(res.queued).toBe(true);
		expect(res._status).toBe(202);
	});
});
