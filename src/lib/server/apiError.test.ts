import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRequestId, handleServerError } from './apiError';
import type { RequestEvent } from '@sveltejs/kit';

describe('apiError server helper', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('getRequestId', () => {
		it('extracts requestId from event.locals if present', () => {
			const event = {
				locals: { requestId: 'test-req-id-123' },
				request: new Request('http://localhost/api/test')
			} as unknown as RequestEvent;

			expect(getRequestId(event)).toBe('test-req-id-123');
		});

		it('extracts requestId from X-Request-ID header if locals has none', () => {
			const headers = new Headers();
			headers.set('X-Request-ID', 'header-req-id-456');
			const event = {
				locals: {},
				request: new Request('http://localhost/api/test', { headers })
			} as unknown as RequestEvent;

			expect(getRequestId(event)).toBe('header-req-id-456');
		});

		it('extracts requestId from X-Correlation-ID header if X-Request-ID missing', () => {
			const headers = new Headers();
			headers.set('X-Correlation-ID', 'corr-id-789');
			const event = {
				locals: {},
				request: new Request('http://localhost/api/test', { headers })
			} as unknown as RequestEvent;

			expect(getRequestId(event)).toBe('corr-id-789');
		});

		it('generates a valid UUID if no id is provided', () => {
			const id = getRequestId();
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		});

		it('returns string unchanged if passed directly', () => {
			expect(getRequestId('custom-id-999')).toBe('custom-id-999');
		});
	});

	describe('handleServerError', () => {
		it('logs full error details with correlation ID and does not leak message to client', async () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const sensitiveError = new Error(
				'Firestore doc path: projects/my-proj/databases/(default)/documents/courses/secret_123 failed'
			);
			const event = {
				locals: { requestId: 'req-corr-999' },
				request: new Request('http://localhost/api/test')
			} as unknown as RequestEvent;

			const response = handleServerError(sensitiveError, event);
			expect(response.status).toBe(500);
			expect(response.headers.get('X-Request-ID')).toBe('req-corr-999');

			const body = await response.json();
			expect(body.requestId).toBe('req-corr-999');
			expect(body.error.code).toBe('SERVER_ERROR');
			expect(body.error.message).toBe('Internal Server Error');
			expect(body.error.requestId).toBe('req-corr-999');

			// Check that sensitive string was NOT returned to the client
			expect(JSON.stringify(body)).not.toContain('projects/my-proj');
			expect(JSON.stringify(body)).not.toContain('secret_123');

			// Check that server-side console logged the correlation ID and the original error
			expect(spy).toHaveBeenCalledWith(
				expect.stringContaining('[req_id=req-corr-999]'),
				sensitiveError
			);
		});

		it('allows specifying custom code and custom generic message', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});

			const rawErr = new Error(
				'ML model worker crashed at http://ml-internal.private:8000/predict'
			);
			const response = handleServerError(
				rawErr,
				'req-xyz',
				'Failed to generate content',
				'AI_ERROR'
			);

			expect(response.status).toBe(500);
			expect(response.headers.get('X-Request-ID')).toBe('req-xyz');

			const body = await response.json();
			expect(body.error.code).toBe('AI_ERROR');
			expect(body.error.message).toBe('Failed to generate content');
			expect(body.error.requestId).toBe('req-xyz');
			expect(JSON.stringify(body)).not.toContain('ml-internal.private');
		});
	});
});
