import { describe, it, expect, vi } from 'vitest';
import { getCachedOutline } from './outlineCache';

describe('outlineCache Unit Tests', () => {
	it('deduplicates concurrent fetches for the same courseId', async () => {
		const fetchFn = vi.fn().mockImplementation(async () => {
			return { id: 'course1', title: 'Calculus I' };
		});

		const promise1 = getCachedOutline('course1', fetchFn);
		const promise2 = getCachedOutline('course1', fetchFn);

		expect(promise1).toBe(promise2);

		const result1 = await promise1;
		const result2 = await promise2;

		expect(result1).toEqual({ id: 'course1', title: 'Calculus I' });
		expect(result2).toEqual({ id: 'course1', title: 'Calculus I' });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('invokes fetchFn independently for different courseIds', async () => {
		const fetch1 = vi.fn().mockResolvedValue({ id: 'c1' });
		const fetch2 = vi.fn().mockResolvedValue({ id: 'c2' });

		const res1 = await getCachedOutline('c1', fetch1);
		const res2 = await getCachedOutline('c2', fetch2);

		expect(res1).toEqual({ id: 'c1' });
		expect(res2).toEqual({ id: 'c2' });
		expect(fetch1).toHaveBeenCalledTimes(1);
		expect(fetch2).toHaveBeenCalledTimes(1);
	});
});
