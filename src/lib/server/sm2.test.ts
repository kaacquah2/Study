import { describe, it, expect } from 'vitest';
import { calculateSM2 } from './sm2';

describe('SM-2 Spaced Repetition Engine', () => {
	const fixedDate = new Date('2026-07-23T00:00:00.000Z');

	it('resets interval and repetitions on low quality rating (q < 3)', () => {
		const result = calculateSM2(
			{ quality: 2, repetitions: 3, interval: 15, easeFactor: 2.5 },
			fixedDate
		);

		expect(result.repetitions).toBe(0);
		expect(result.interval).toBe(1);
		expect(result.nextReviewDate).toBe('2026-07-24');
		expect(result.easeFactor).toBeLessThan(2.5);
	});

	it('computes correct intervals for consecutive successful reviews (q >= 3)', () => {
		// First successful review
		const r1 = calculateSM2(
			{ quality: 4, repetitions: 0, interval: 0, easeFactor: 2.5 },
			fixedDate
		);
		expect(r1.repetitions).toBe(1);
		expect(r1.interval).toBe(1);
		expect(r1.nextReviewDate).toBe('2026-07-24');

		// Second successful review
		const r2 = calculateSM2(
			{ quality: 5, repetitions: r1.repetitions, interval: r1.interval, easeFactor: r1.easeFactor },
			fixedDate
		);
		expect(r2.repetitions).toBe(2);
		expect(r2.interval).toBe(6);
		expect(r2.nextReviewDate).toBe('2026-07-29');

		// Third successful review
		const r3 = calculateSM2(
			{ quality: 5, repetitions: r2.repetitions, interval: r2.interval, easeFactor: r2.easeFactor },
			fixedDate
		);
		expect(r3.repetitions).toBe(3);
		expect(r3.interval).toBe(16); // 6 * 2.6 = 15.6 -> 16
		expect(r3.nextReviewDate).toBe('2026-08-08');
	});

	it('enforces minimum Ease Factor threshold of 1.3', () => {
		const result = calculateSM2(
			{ quality: 0, repetitions: 0, interval: 1, easeFactor: 1.3 },
			fixedDate
		);
		expect(result.easeFactor).toBe(1.3);
	});
});
