/**
 * Free Spaced Repetition Scheduler (FSRS-4.5) Domain Engine
 *
 * Implements the FSRS algorithm for modern memory retention modeling based on
 * Stability (S), Difficulty (D), and Retrievability (R).
 */

export interface FSRSCard {
	stability: number; // Time in days for retrievability to decay to 90%
	difficulty: number; // Intrinsic difficulty (1 to 10)
	reps: number; // Total number of reviews
	lapses: number; // Number of failed recalls
	state: 'New' | 'Learning' | 'Review' | 'Relearning';
	lastReview: string | null; // ISO timestamp string
}

export interface FSRSInput {
	/** Rating: 0-5 (Quality) or 1-4 (FSRS rating: 1=Again, 2=Hard, 3=Good, 4=Easy) */
	quality: number;
	card?: Partial<FSRSCard>;
}

export interface FSRSOutput {
	card: FSRSCard;
	intervalDays: number; // Next review interval in days
	nextReviewDate: string; // ISO date string (YYYY-MM-DD)
}

// Default FSRS-4.5 weights (W)
export const FSRS_WEIGHTS = [
	0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.5457, 0.1192, 1.0192, 1.9395,
	0.11, 0.29605, 2.2698, 0.2315, 2.9898
];

/** Map 0-5 quality score to FSRS rating 1-4 */
export function qualityToRating(quality: number): 1 | 2 | 3 | 4 {
	const q = Math.max(0, Math.min(5, Math.round(quality)));
	if (q <= 1) return 1; // Again
	if (q === 2) return 2; // Hard
	if (q === 3 || q === 4) return 3; // Good
	return 4; // Easy
}

/**
 * Calculates next review interval and updated card memory state via FSRS-4.5.
 */
export function calculateFSRS(input: FSRSInput, currentDate: Date = new Date()): FSRSOutput {
	const rating = qualityToRating(input.quality);

	const initialCard: FSRSCard = {
		stability: input.card?.stability || 0,
		difficulty: input.card?.difficulty || 5,
		reps: input.card?.reps || 0,
		lapses: input.card?.lapses || 0,
		state: input.card?.state || 'New',
		lastReview: input.card?.lastReview || null
	};

	let { stability, difficulty, reps, lapses, state } = initialCard;

	if (state === 'New' || reps === 0) {
		// Initial review for new card
		stability = FSRS_WEIGHTS[rating - 1];
		difficulty = Math.max(1, Math.min(10, FSRS_WEIGHTS[4] - (rating - 3) * FSRS_WEIGHTS[5]));
		state = rating === 1 ? 'Learning' : 'Review';
		reps = 1;
	} else {
		// Existing card review
		const lastReviewDate = initialCard.lastReview ? new Date(initialCard.lastReview) : currentDate;
		const elapsedDays = Math.max(
			0,
			(currentDate.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24)
		);

		// Current retrievability R(t, S)
		const R = Math.pow(1 + elapsedDays / (9 * (stability || 1)), -1);

		// Update Difficulty (Mean Reversion to initial target)
		const deltaD = -FSRS_WEIGHTS[6] * (rating - 3);
		const targetD = difficulty + deltaD;
		difficulty = Math.max(1, Math.min(10, FSRS_WEIGHTS[7] * FSRS_WEIGHTS[4] + (1 - FSRS_WEIGHTS[7]) * targetD));

		if (rating === 1) {
			// Lapse (Failed Recall)
			lapses += 1;
			stability =
				FSRS_WEIGHTS[11] *
				Math.pow(difficulty, -FSRS_WEIGHTS[12]) *
				(Math.pow((stability || 1) + 1, FSRS_WEIGHTS[13]) - 1) *
				Math.exp((1 - R) * FSRS_WEIGHTS[14]);
			state = 'Relearning';
		} else {
			// Successful Recall
			const hardPenalty = rating === 2 ? FSRS_WEIGHTS[15] : 1;
			const easyBonus = rating === 4 ? FSRS_WEIGHTS[16] : 1;

			stability =
				(stability || 1) *
				(1 +
					Math.exp(FSRS_WEIGHTS[8]) *
						(11 - difficulty) *
						Math.pow(stability || 1, -FSRS_WEIGHTS[9]) *
						(Math.exp((1 - R) * FSRS_WEIGHTS[10]) - 1) *
						hardPenalty *
						easyBonus);
			state = 'Review';
		}

		reps += 1;
	}

	// Stability bounds: 0.1 days to 36500 days (100 years)
	stability = Math.max(0.1, Math.min(36500, stability));
	difficulty = Math.max(1, Math.min(10, difficulty));

	// Calculate next optimal interval (target retention = 90%)
	const targetRetention = 0.9;
	const factor = 9 * (1 / targetRetention - 1);
	let intervalDays = Math.round(stability * factor);

	// Ensure minimum progression for non-lapse ratings
	if (rating > 1) {
		intervalDays = Math.max(1, intervalDays);
	} else {
		intervalDays = 0; // Immediate relearning queue
	}

	const nextDate = new Date(currentDate);
	nextDate.setDate(nextDate.getDate() + Math.max(1, intervalDays));
	const nextReviewDate = nextDate.toISOString().split('T')[0];

	return {
		card: {
			stability: Math.round(stability * 100) / 100,
			difficulty: Math.round(difficulty * 100) / 100,
			reps,
			lapses,
			state,
			lastReview: currentDate.toISOString()
		},
		intervalDays,
		nextReviewDate
	};
}

/**
 * Calculates current estimated retrievability R(t, S) for a card given elapsed days.
 */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
	if (stability <= 0) return 0;
	return Math.pow(1 + elapsedDays / (9 * stability), -1);
}
