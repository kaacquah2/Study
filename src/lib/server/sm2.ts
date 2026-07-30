/**
 * SuperMemo 2 (SM-2) Spaced Repetition Algorithm.
 *
 * Computes interval, repetition count, and ease factor (EF)
 * based on user review rating (0 to 5).
 */

export interface SM2Input {
	/** Review performance rating: 0 (blackout) to 5 (perfect execution) */
	quality: number;
	/** Number of consecutive correct reviews (quality >= 3) */
	repetitions: number;
	/** Inter-repetition interval in days */
	interval: number;
	/** Ease Factor (EF), initial default is 2.5 */
	easeFactor: number;
}

export interface SM2Output {
	repetitions: number;
	interval: number;
	easeFactor: number;
	nextReviewDate: string; // ISO date string (YYYY-MM-DD)
}

export function calculateSM2(input: SM2Input, currentDate: Date = new Date()): SM2Output {
	const quality = Math.max(0, Math.min(5, Math.round(input.quality)));
	let repetitions = input.repetitions || 0;
	let interval = input.interval || 0;
	let easeFactor = input.easeFactor || 2.5;

	if (quality >= 3) {
		if (repetitions === 0) {
			interval = 1;
		} else if (repetitions === 1) {
			interval = 6;
		} else {
			interval = Math.round(interval * easeFactor);
		}
		repetitions += 1;
	} else {
		// Quality < 3: Incorrect response, reset repetitions
		repetitions = 0;
		interval = 1;
	}

	// Update Ease Factor (EF) formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
	easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
	if (easeFactor < 1.3) {
		easeFactor = 1.3; // Minimum EF threshold
	}

	const nextDate = new Date(currentDate);
	nextDate.setDate(nextDate.getDate() + interval);
	const nextReviewDate = nextDate.toISOString().split('T')[0];

	return {
		repetitions,
		interval,
		easeFactor: Number(easeFactor.toFixed(3)),
		nextReviewDate
	};
}
