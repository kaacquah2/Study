import { describe, it, expect, vi } from 'vitest';
import { handle } from './hooks.server';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/server/ai/client', () => ({
	validateMLBackendConnection: vi.fn().mockResolvedValue({ ok: true, status: 'OK' })
}));

describe('hooks.server.ts Handle Hook', () => {
	it('attaches Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy headers to responses', async () => {
		const mockEvent = {
			request: new Request('http://localhost:5173/dashboard', {
				method: 'GET'
			}),
			url: new URL('http://localhost:5173/dashboard'),
			locals: {}
		} as unknown as RequestEvent;

		const mockResolve = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

		const response = await handle({ event: mockEvent, resolve: mockResolve });

		expect(response.headers.get('Content-Security-Policy')).toBe(
			"default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com;"
		);
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});
});
