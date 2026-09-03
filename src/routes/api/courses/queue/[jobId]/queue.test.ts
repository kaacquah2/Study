import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { verifySessionUser } from '$lib/server/auth';
import { getGenerationJobStatus, processQueuedJob } from '$lib/server/ai/generationQueue';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/ai/generationQueue', () => ({
	getGenerationJobStatus: vi.fn(),
	processQueuedJob: vi.fn().mockResolvedValue(undefined)
}));

describe('GET /api/courses/queue/[jobId] Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 UNAUTHORIZED when user is not authenticated', async () => {
		vi.mocked(verifySessionUser).mockRejectedValue(
			new Error('Unauthorized: Missing session token')
		);

		const request = new Request('http://localhost/api/courses/queue/job-123', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'job-123' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(401);
		expect(json.error.code).toBe('UNAUTHORIZED');
	});

	it('returns 404 NOT_FOUND when job does not exist', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user_alice' });
		vi.mocked(getGenerationJobStatus).mockResolvedValue(null);

		const request = new Request('http://localhost/api/courses/queue/non-existent-job', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'non-existent-job' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(404);
		expect(json.error.code).toBe('NOT_FOUND');
		expect(processQueuedJob).not.toHaveBeenCalled();
	});

	it('returns 404 NOT_FOUND when job belongs to a different user (IDOR prevention)', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'attacker_bob' });
		vi.mocked(getGenerationJobStatus).mockResolvedValue({
			jobId: 'victim_job_123',
			jobType: 'outline',
			userId: 'victim_alice',
			courseId: 'course_victim',
			topic: 'Secret Topic',
			status: 'queued',
			attempts: 0,
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});

		const request = new Request('http://localhost/api/courses/queue/victim_job_123', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'victim_job_123' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(404);
		expect(json.error.code).toBe('NOT_FOUND');
		// Must not trigger processQueuedJob for another user's job
		expect(processQueuedJob).not.toHaveBeenCalled();
	});

	it('returns 200 OK and triggers processQueuedJob when job is queued and belongs to user', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user_alice' });
		const mockJob = {
			jobId: 'job_456',
			jobType: 'outline' as const,
			userId: 'user_alice',
			courseId: 'course_123',
			topic: 'Machine Learning',
			status: 'queued' as const,
			attempts: 0,
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		vi.mocked(getGenerationJobStatus).mockResolvedValue(mockJob);

		const request = new Request('http://localhost/api/courses/queue/job_456', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'job_456' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.jobId).toBe('job_456');
		expect(json.userId).toBe('user_alice');
		expect(processQueuedJob).toHaveBeenCalledWith('job_456');
	});

	it('returns 200 OK without triggering processQueuedJob when job is already completed', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user_alice' });
		const mockJob = {
			jobId: 'job_789',
			jobType: 'outline' as const,
			userId: 'user_alice',
			courseId: 'course_123',
			topic: 'Machine Learning',
			status: 'completed' as const,
			attempts: 1,
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		vi.mocked(getGenerationJobStatus).mockResolvedValue(mockJob);

		const request = new Request('http://localhost/api/courses/queue/job_789', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'job_789' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.status).toBe('completed');
		expect(processQueuedJob).not.toHaveBeenCalled();
	});

	it('returns 200 OK without triggering processQueuedJob when job is queued but backoff delay has not elapsed', async () => {
		vi.mocked(verifySessionUser).mockResolvedValue({ uid: 'user_alice' });
		const mockJob = {
			jobId: 'job_backoff_wait',
			jobType: 'outline' as const,
			userId: 'user_alice',
			courseId: 'course_123',
			topic: 'Machine Learning',
			status: 'queued' as const,
			attempts: 1,
			maxAttempts: 3,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			nextRetryAt: Date.now() + 30000 // 30s in future
		};
		vi.mocked(getGenerationJobStatus).mockResolvedValue(mockJob);

		const request = new Request('http://localhost/api/courses/queue/job_backoff_wait', {
			method: 'GET'
		});

		const response = await GET({
			request,
			params: { jobId: 'job_backoff_wait' }
		} as unknown as Parameters<typeof GET>[0]);

		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.status).toBe('queued');
		expect(processQueuedJob).not.toHaveBeenCalled();
	});
});
