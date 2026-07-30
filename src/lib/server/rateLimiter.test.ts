import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforceRateLimit } from './rateLimiter';
import { adminDb } from './admin';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';

vi.mock('./admin', () => ({
	adminDb: {
		runTransaction: vi.fn()
	}
}));

describe('rateLimiter Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows action and increments count when under rate limit', async () => {
		const mockDocRef = {} as unknown as DocumentReference;
		const mockTransaction = {
			get: vi.fn().mockResolvedValue({
				exists: true,
				data: () => ({ hourlyCount: 2, hourlyWindow: '2026-07-20-10' })
			}),
			set: vi.fn()
		};

		vi.mocked(adminDb.runTransaction).mockImplementation(async (cb: (t: Transaction) => unknown) =>
			cb(mockTransaction as unknown as Transaction)
		);

		await expect(
			enforceRateLimit(mockDocRef, 5, '2026-07-20-10', 'hourlyCount', 'hourlyWindow')
		).resolves.not.toThrow();

		expect(mockTransaction.set).toHaveBeenCalledWith(
			mockDocRef,
			{
				hourlyCount: 3,
				hourlyWindow: '2026-07-20-10'
			},
			{ merge: true }
		);
	});

	it('throws RATE_LIMIT_EXCEEDED when current count equals or exceeds limit', async () => {
		const mockDocRef = {} as unknown as DocumentReference;
		const mockTransaction = {
			get: vi.fn().mockResolvedValue({
				exists: true,
				data: () => ({ hourlyCount: 5, hourlyWindow: '2026-07-20-10' })
			}),
			set: vi.fn()
		};

		vi.mocked(adminDb.runTransaction).mockImplementation(async (cb: (t: Transaction) => unknown) =>
			cb(mockTransaction as unknown as Transaction)
		);

		await expect(
			enforceRateLimit(mockDocRef, 5, '2026-07-20-10', 'hourlyCount', 'hourlyWindow')
		).rejects.toThrow('RATE_LIMIT_EXCEEDED');

		expect(mockTransaction.set).not.toHaveBeenCalled();
	});

	it('resets count when window key changes (new hour/day)', async () => {
		const mockDocRef = {} as unknown as DocumentReference;
		const mockTransaction = {
			get: vi.fn().mockResolvedValue({
				exists: true,
				data: () => ({ hourlyCount: 5, hourlyWindow: '2026-07-20-09' }) // Previous hour
			}),
			set: vi.fn()
		};

		vi.mocked(adminDb.runTransaction).mockImplementation(async (cb: (t: Transaction) => unknown) =>
			cb(mockTransaction as unknown as Transaction)
		);

		await expect(
			enforceRateLimit(mockDocRef, 5, '2026-07-20-10', 'hourlyCount', 'hourlyWindow')
		).resolves.not.toThrow();

		expect(mockTransaction.set).toHaveBeenCalledWith(
			mockDocRef,
			{
				hourlyCount: 1,
				hourlyWindow: '2026-07-20-10'
			},
			{ merge: true }
		);
	});

	it('enforces strict quota limit across N consecutive requests and blocks the (N+1)-th request', async () => {
		const mockDocRef = {} as unknown as DocumentReference;
		const MAX_LIMIT = 3;
		let currentCount = 0;

		const mockTransaction = {
			get: vi.fn().mockImplementation(async () => ({
				exists: true,
				data: () => ({ hourlyCount: currentCount, hourlyWindow: '2026-07-20-10' })
			})),
			set: vi.fn().mockImplementation((_, data) => {
				currentCount = data.hourlyCount;
			})
		};

		vi.mocked(adminDb.runTransaction).mockImplementation(async (cb: (t: Transaction) => unknown) =>
			cb(mockTransaction as unknown as Transaction)
		);

		// First N (3) requests should succeed
		for (let i = 1; i <= MAX_LIMIT; i++) {
			await expect(
				enforceRateLimit(mockDocRef, MAX_LIMIT, '2026-07-20-10', 'hourlyCount', 'hourlyWindow')
			).resolves.not.toThrow();
		}

		expect(currentCount).toBe(3);

		// The (N+1)-th request must fail with RATE_LIMIT_EXCEEDED
		await expect(
			enforceRateLimit(mockDocRef, MAX_LIMIT, '2026-07-20-10', 'hourlyCount', 'hourlyWindow')
		).rejects.toThrow('RATE_LIMIT_EXCEEDED');

		expect(currentCount).toBe(3); // Counter should not increment beyond max limit
	});
});
