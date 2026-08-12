/**
 * Free Spaced Repetition Scheduler (FSRS-4.5) Engine
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
const W = [
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
		stability = W[rating - 1];
		difficulty = Math.max(1, Math.min(10, W[4] - (rating - 3) * W[5]));
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
		const deltaD = -W[6] * (rating - 3);
		const targetD = difficulty + deltaD;
		difficulty = Math.max(1, Math.min(10, W[7] * W[4] + (1 - W[7]) * targetD));

		if (rating === 1) {
			// Lapse (Failed Recall)
			lapses += 1;
			stability =
				W[11] *
				Math.pow(difficulty, -W[12]) *
				(Math.pow((stability || 1) + 1, W[13]) - 1) *
				Math.exp((1 - R) * W[14]);
			state = 'Relearning';
		} else {
			// Successful Recall
			const hardPenalty = rating === 2 ? W[15] : 1;
			const easyBonus = rating === 4 ? W[16] : 1;

			stability =
				(stability || 1) *
				(1 +
					Math.exp(W[8]) *
						(11 - difficulty) *
						Math.pow(stability || 1, -W[9]) *
						(Math.exp((1 - R) * W[10]) - 1) *
						hardPenalty *
						easyBonus);
			state = 'Review';
		}
		reps += 1;
	}

	// Calculate target interval for 90% retention rate
	const intervalDays = Math.max(1, Math.round(9 * stability * (1 / 0.9 - 1)));

	const nextDate = new Date(currentDate);
	nextDate.setDate(nextDate.getDate() + intervalDays);
	const nextReviewDate = nextDate.toISOString().split('T')[0];

	return {
		card: {
			stability: Number(stability.toFixed(4)),
			difficulty: Number(difficulty.toFixed(2)),
			reps,
			lapses,
			state,
			lastReview: currentDate.toISOString()
		},
		intervalDays,
		nextReviewDate
	};
}

export interface FSRSReviewLog {
	cardId?: string;
	courseId: string;
	moduleId: string;
	questionIndex: number;
	quality: number;
	elapsedDays: number;
	predictedRetrievability: number;
	newStability: number;
	newDifficulty: number;
	timestamp: string;
}

export interface FSRSOptimizationResult {
	sampleCount: number;
	averageRetention: number;
	recommendedStabilityFactor: number;
	isCalibrated: boolean;
}

/**
 * Evaluates historical review logs to calculate user-specific memory retention performance
 * and derive calibrated stability scaling factors.
 */
export function optimizeFSRSWeights(logs: FSRSReviewLog[]): FSRSOptimizationResult {
	if (!logs || logs.length === 0) {
		return {
			sampleCount: 0,
			averageRetention: 0.9,
			recommendedStabilityFactor: 1.0,
			isCalibrated: false
		};
	}

	const successfulRecalls = logs.filter((log) => log.quality >= 3).length;
	const averageRetention = Number((successfulRecalls / logs.length).toFixed(3));

	// If observed retention differs from target (90%), scale stability factor accordingly
	// Target R = 0.9. If average retention is lower (e.g. 0.8), stability is scaled up to increase review frequency.
	const targetRetention = 0.9;
	const ratio = Math.max(0.5, Math.min(1.5, averageRetention / targetRetention));
	const recommendedStabilityFactor = Number(ratio.toFixed(3));

	return {
		sampleCount: logs.length,
		averageRetention,
		recommendedStabilityFactor,
		isCalibrated: logs.length >= 10
	};
}
