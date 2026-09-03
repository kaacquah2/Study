import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const mockEnv: Record<string, string | undefined> = {};

vi.mock('$env/dynamic/private', () => ({
	get env() {
		return mockEnv;
	}
}));

import {
	buildMLAuthHeaders,
	pingMLBackend,
	validateMLBackendConnection,
	getMLBackendHealth
} from './client';

describe('ML Client HMAC and Healthcheck Authentication Tests', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		for (const key of Object.keys(mockEnv)) {
			delete mockEnv[key];
		}
		delete process.env.ML_BACKEND_SECRET;
		delete process.env.ML_BACKEND_API_KEY;
		delete process.env.ML_BACKEND_URL;
	});

	it('buildMLAuthHeaders includes X-API-Key and no HMAC headers when secret is unset', () => {
		mockEnv.ML_BACKEND_API_KEY = 'test-key-123';

		const headers = buildMLAuthHeaders('{}', 'user-456');

		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['X-API-Key']).toBe('test-key-123');
		expect(headers['X-User-ID']).toBe('user-456');
		expect(headers['X-Signature']).toBeUndefined();
		expect(headers['X-Timestamp']).toBeUndefined();
		expect(headers['X-Nonce']).toBeUndefined();
	});

	it('buildMLAuthHeaders includes valid HMAC signature, timestamp, and nonce when ML_BACKEND_SECRET is set', () => {
		const secret = 'super-secure-secret-xyz';
		mockEnv.ML_BACKEND_API_KEY = 'test-key-123';
		mockEnv.ML_BACKEND_SECRET = secret;

		const body = JSON.stringify({ prompt: 'Test summarization prompt' });
		const headers = buildMLAuthHeaders(body, 'user-789');

		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['X-API-Key']).toBe('test-key-123');
		expect(headers['X-User-ID']).toBe('user-789');
		expect(headers['X-Signature']).toBeDefined();
		expect(headers['X-Timestamp']).toBeDefined();
		expect(headers['X-Nonce']).toBeDefined();

		// Verify HMAC computation
		const ts = headers['X-Timestamp'];
		const nonce = headers['X-Nonce'];
		const expectedSig = crypto
			.createHmac('sha256', secret)
			.update(`${ts}.${nonce}.${body}`)
			.digest('hex');

		expect(headers['X-Signature']).toBe(expectedSig);
	});

	it('pingMLBackend sends HMAC headers when ML_BACKEND_SECRET is configured', async () => {
		const secret = 'secret-key-probe';
		mockEnv.ML_BACKEND_URL = 'http://127.0.0.1:8000';
		mockEnv.ML_BACKEND_API_KEY = 'valid-api-key';
		mockEnv.ML_BACKEND_SECRET = secret;

		let capturedHeaders: HeadersInit | undefined;
		global.fetch = vi.fn().mockImplementation((url, init) => {
			capturedHeaders = init?.headers;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ status: 'ok', ready: true, inference_busy: false })
			} as Response);
		});

		const result = await pingMLBackend();

		expect(result.available).toBe(true);
		expect(capturedHeaders).toBeDefined();
		const headers = capturedHeaders as Record<string, string>;
		expect(headers['X-API-Key']).toBe('valid-api-key');
		expect(headers['X-Signature']).toBeDefined();
		expect(headers['X-Timestamp']).toBeDefined();
		expect(headers['X-Nonce']).toBeDefined();

		// Check that signature was calculated on empty body "{}"
		const ts = headers['X-Timestamp'];
		const nonce = headers['X-Nonce'];
		const expectedSig = crypto
			.createHmac('sha256', secret)
			.update(`${ts}.${nonce}.{}`)
			.digest('hex');

		expect(headers['X-Signature']).toBe(expectedSig);
	});

	it('validateMLBackendConnection sends HMAC headers and succeeds with valid status', async () => {
		const secret = 'boot-validation-secret';
		mockEnv.ML_BACKEND_URL = 'http://127.0.0.1:8000';
		mockEnv.ML_BACKEND_API_KEY = 'boot-api-key';
		mockEnv.ML_BACKEND_SECRET = secret;

		let capturedHeaders: HeadersInit | undefined;
		global.fetch = vi.fn().mockImplementation((url, init) => {
			capturedHeaders = init?.headers;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ status: 'ok', ready: true })
			} as Response);
		});

		const result = await validateMLBackendConnection();

		expect(result.ok).toBe(true);
		expect(result.status).toBe('OK');
		const headers = capturedHeaders as Record<string, string>;
		expect(headers['X-Signature']).toBeDefined();
		expect(headers['X-Timestamp']).toBeDefined();
		expect(headers['X-Nonce']).toBeDefined();
	});

	it('getMLBackendHealth sends HMAC headers and returns live data', async () => {
		const secret = 'health-secret-456';
		mockEnv.ML_BACKEND_URL = 'http://127.0.0.1:8000';
		mockEnv.ML_BACKEND_API_KEY = 'health-api-key';
		mockEnv.ML_BACKEND_SECRET = secret;

		let capturedHeaders: HeadersInit | undefined;
		global.fetch = vi.fn().mockImplementation((url, init) => {
			capturedHeaders = init?.headers;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						status: 'ok',
						ready: true,
						models_loaded: { summarizer: true },
						inference_busy: false
					})
			} as Response);
		});

		const data = await getMLBackendHealth();

		expect(data).not.toBeNull();
		expect(data?.status).toBe('ok');
		expect(data?.models_loaded.summarizer).toBe(true);
		const headers = capturedHeaders as Record<string, string>;
		expect(headers['X-Signature']).toBeDefined();
		expect(headers['X-Timestamp']).toBeDefined();
		expect(headers['X-Nonce']).toBeDefined();
	});
});
