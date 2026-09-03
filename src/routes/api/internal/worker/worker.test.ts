import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as processJobHandler } from './process-job/+server';
import { POST as reconcileHandler } from './reconcile/+server';
import {
	processQueuedJob,
	getGenerationJobStatus,
	reconcileStalledJobs
} from '$lib/server/ai/generationQueue';
import { getWorkerSecret } from '$lib/server/ai/taskDispatcher';

vi.mock('$lib/server/ai/generationQueue', () => ({
	processQueuedJob: vi.fn().mockResolvedValue(undefined),
	getGenerationJobStatus: vi.fn(),
	reconcileStalledJobs: vi.fn().mockResolvedValue({ recoveredCount: 2, failedCount: 1 })
}));

describe('Internal Worker Security & Endpoints', () => {
	const validSecret = 'super_secure_internal_worker_secret_12345';
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = { ...originalEnv };
		process.env.INTERNAL_WORKER_SECRET = validSecret;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('getWorkerSecret()', () => {
		it('returns configured secret when INTERNAL_WORKER_SECRET is set', () => {
			process.env.INTERNAL_WORKER_SECRET = 'my_custom_secret';
			expect(getWorkerSecret()).toBe('my_custom_secret');
		});

		it('returns empty string and logs warning when secret is unset in non-production', () => {
			delete process.env.INTERNAL_WORKER_SECRET;
			process.env.NODE_ENV = 'development';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const secret = getWorkerSecret();
			expect(secret).toBe('');
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('INTERNAL_WORKER_SECRET unset — worker endpoints disabled.')
			);
			warnSpy.mockRestore();
		});

		it('throws a fatal error when secret is unset in production', () => {
			delete process.env.INTERNAL_WORKER_SECRET;
			process.env.NODE_ENV = 'production';

			expect(() => getWorkerSecret()).toThrow(
				'[FATAL] INTERNAL_WORKER_SECRET is required in production.'
			);
		});
	});

	describe('POST /api/internal/worker/process-job', () => {
		it('returns 401 UNAUTHORIZED when worker secret is missing', async () => {
			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jobId: 'job_123' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 401 UNAUTHORIZED when worker secret in env is unset', async () => {
			delete process.env.INTERNAL_WORKER_SECRET;
			process.env.NODE_ENV = 'test';
			vi.spyOn(console, 'warn').mockImplementation(() => {});

			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': 'some_attempted_secret'
				},
				body: JSON.stringify({ jobId: 'job_123' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 401 UNAUTHORIZED when worker secret is incorrect (different length)', async () => {
			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': 'short_wrong'
				},
				body: JSON.stringify({ jobId: 'job_123' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 401 UNAUTHORIZED when worker secret is incorrect (same length)', async () => {
			const wrongSameLength = 'x'.repeat(validSecret.length);
			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': wrongSameLength
				},
				body: JSON.stringify({ jobId: 'job_123' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 400 INVALID_INPUT when jobId is missing', async () => {
			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': validSecret
				},
				body: JSON.stringify({})
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(400);
		});

		it('successfully processes job when secret is provided via X-Worker-Secret header', async () => {
			vi.mocked(getGenerationJobStatus).mockResolvedValue({
				jobId: 'job_test_123',
				jobType: 'module',
				userId: 'u1',
				courseId: 'c1',
				status: 'completed',
				attempts: 1,
				maxAttempts: 3,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': validSecret
				},
				body: JSON.stringify({ jobId: 'job_test_123' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('completed');
			expect(data.jobId).toBe('job_test_123');
			expect(processQueuedJob).toHaveBeenCalledWith('job_test_123');
		});

		it('successfully processes job when secret is provided via Authorization Bearer header', async () => {
			vi.mocked(getGenerationJobStatus).mockResolvedValue({
				jobId: 'job_test_456',
				jobType: 'outline',
				userId: 'u1',
				courseId: 'c1',
				status: 'completed',
				attempts: 1,
				maxAttempts: 3,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});

			const request = new Request('http://localhost/api/internal/worker/process-job', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${validSecret}`
				},
				body: JSON.stringify({ jobId: 'job_test_456' })
			});

			const response = await processJobHandler({
				request
			} as unknown as Parameters<typeof processJobHandler>[0]);
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('completed');
			expect(data.jobId).toBe('job_test_456');
			expect(processQueuedJob).toHaveBeenCalledWith('job_test_456');
		});
	});

	describe('POST /api/internal/worker/reconcile', () => {
		it('returns 401 when worker secret is invalid', async () => {
			const request = new Request('http://localhost/api/internal/worker/reconcile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': 'wrong_secret'
				}
			});

			const response = await reconcileHandler({
				request
			} as unknown as Parameters<typeof reconcileHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('returns 401 when worker secret in env is unset', async () => {
			delete process.env.INTERNAL_WORKER_SECRET;
			process.env.NODE_ENV = 'test';
			vi.spyOn(console, 'warn').mockImplementation(() => {});

			const request = new Request('http://localhost/api/internal/worker/reconcile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': validSecret
				}
			});

			const response = await reconcileHandler({
				request
			} as unknown as Parameters<typeof reconcileHandler>[0]);
			expect(response.status).toBe(401);
		});

		it('executes reconciliation when valid secret is provided', async () => {
			const request = new Request('http://localhost/api/internal/worker/reconcile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': validSecret
				}
			});

			const response = await reconcileHandler({
				request
			} as unknown as Parameters<typeof reconcileHandler>[0]);
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.recoveredCount).toBe(2);
			expect(data.failedCount).toBe(1);
			expect(reconcileStalledJobs).toHaveBeenCalled();
		});
	});
});
