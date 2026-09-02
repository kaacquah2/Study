import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as processJobHandler } from './process-job/+server';
import { POST as reconcileHandler } from './reconcile/+server';
import {
	processQueuedJob,
	getGenerationJobStatus,
	reconcileStalledJobs
} from '$lib/server/ai/generationQueue';

vi.mock('$lib/server/ai/generationQueue', () => ({
	processQueuedJob: vi.fn().mockResolvedValue(undefined),
	getGenerationJobStatus: vi.fn(),
	reconcileStalledJobs: vi.fn().mockResolvedValue({ recoveredCount: 2, failedCount: 1 })
}));

describe('Internal Worker API Endpoints', () => {
	const validSecret = 'dev_internal_worker_secret_key';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/internal/worker/process-job', () => {
		it('returns 401 UNAUTHORIZED when worker secret is missing or incorrect', async () => {
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

		it('successfully processes job when secret is provided and valid', async () => {
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
