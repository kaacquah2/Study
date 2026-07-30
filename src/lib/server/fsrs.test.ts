import { describe, it, expect } from 'vitest';
import { calculateFSRS, qualityToRating } from './fsrs';

describe('FSRS-4.5 Spaced Repetition Engine', () => {
	it('maps quality ratings 0-5 correctly to 1-4 scale', () => {
		expect(qualityToRating(0)).toBe(1);
		expect(qualityToRating(1)).toBe(1);
		expect(qualityToRating(2)).toBe(2);
		expect(qualityToRating(3)).toBe(3);
		expect(qualityToRating(4)).toBe(3);
		expect(qualityToRating(5)).toBe(4);
	});

	it('initializes a new card on first review with quality=4 (Easy)', () => {
		const result = calculateFSRS({ quality: 5 }, new Date('2026-07-29T00:00:00Z'));

		expect(result.card.reps).toBe(1);
		expect(result.card.lapses).toBe(0);
		expect(result.card.state).toBe('Review');
		expect(result.card.stability).toBeGreaterThan(3);
		expect(result.intervalDays).toBeGreaterThanOrEqual(1);
		expect(result.nextReviewDate).toBeDefined();
	});

	it('updates stability and increments lapses on failed review (quality=0)', () => {
		const initialResult = calculateFSRS({ quality: 3 }, new Date('2026-07-01T00:00:00Z'));
		const lapseResult = calculateFSRS(
			{ quality: 0, card: initialResult.card },
			new Date('2026-07-15T00:00:00Z')
		);

		expect(lapseResult.card.reps).toBe(2);
		expect(lapseResult.card.lapses).toBe(1);
		expect(lapseResult.card.state).toBe('Relearning');
		expect(lapseResult.intervalDays).toBeGreaterThanOrEqual(1);
	});
});
