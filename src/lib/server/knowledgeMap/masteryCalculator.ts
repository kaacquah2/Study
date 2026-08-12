/**
 * Module Mastery Calculator
 *
 * Computes aggregate module-level mastery based on real FSRS question states in Firestore.
 *
 * NOTE ON HEURISTIC WEIGHTS:
 * The MASTERY_WEIGHTS values below are hand-tuned heuristic approximations used for visual rank
 * and prioritization within the knowledge map. They are not statistically calibrated probability models.
 */

export interface QuizQuestion {
	prompt?: string;
	question?: string;
	options?: string[];
	correctIndex?: number;
	answerIndex?: number;
	explanation?: string;
	fsrsState?: 'New' | 'Learning' | 'Review' | 'Relearning';
	stability?: number;
	difficulty?: number;
	reps?: number;
	lapses?: number;
	lastReviewedAt?: string | null;
	nextReviewDate?: string;
}

export interface ModuleMastery {
	moduleId: string;
	masteryPercent: number; // -1 for not-assessed, 0-100 otherwise
	questionsTotal: number;
	questionsReviewed: number;
	questionsDue: number;
	averageStability: number;
	fsrsState: 'not-assessed' | 'not-started' | 'learning' | 'reviewing' | 'mastered';
}

const MASTERY_WEIGHTS: Record<string, number> = {
	New: 0,
	Learning: 0.4,
	Review: 0.8,
	Review_high: 1.0, // Review state with stability >= 10 days
	Relearning: 0.2
};

export function computeModuleMastery(
	moduleId: string,
	questions: QuizQuestion[] | null | undefined,
	todayStr: string = new Date().toISOString().split('T')[0]
): ModuleMastery {
	// Case 1: Pure lesson module or no quiz questions -> not-assessed
	if (!questions || !Array.isArray(questions) || questions.length === 0) {
		return {
			moduleId,
			masteryPercent: -1,
			questionsTotal: 0,
			questionsReviewed: 0,
			questionsDue: 0,
			averageStability: 0,
			fsrsState: 'not-assessed'
		};
	}

	const questionsTotal = questions.length;
	let questionsReviewed = 0;
	let questionsDue = 0;
	let totalStability = 0;
	let totalWeight = 0;

	for (const q of questions) {
		const isReviewed = Boolean(q.lastReviewedAt);
		const isDue = !q.nextReviewDate || q.nextReviewDate <= todayStr;

		if (isDue) {
			questionsDue += 1;
		}

		if (isReviewed) {
			questionsReviewed += 1;
			const stability = typeof q.stability === 'number' ? q.stability : 0;
			totalStability += stability;

			const state = q.fsrsState || 'Learning';
			if (state === 'Review') {
				totalWeight += stability >= 10 ? MASTERY_WEIGHTS.Review_high : MASTERY_WEIGHTS.Review;
			} else if (state === 'Learning') {
				totalWeight += MASTERY_WEIGHTS.Learning;
			} else if (state === 'Relearning') {
				totalWeight += MASTERY_WEIGHTS.Relearning;
			} else {
				totalWeight += MASTERY_WEIGHTS.New;
			}
		} else {
			totalWeight += MASTERY_WEIGHTS.New;
		}
	}

	// Case 2: Quiz exists, but zero questions have been reviewed yet -> not-started
	if (questionsReviewed === 0) {
		return {
			moduleId,
			masteryPercent: 0,
			questionsTotal,
			questionsReviewed: 0,
			questionsDue,
			averageStability: 0,
			fsrsState: 'not-started'
		};
	}

	const masteryPercent = Math.round((totalWeight / questionsTotal) * 100);
	const averageStability = Number((totalStability / questionsReviewed).toFixed(1));

	let fsrsState: ModuleMastery['fsrsState'] = 'learning';
	if (masteryPercent >= 80) {
		fsrsState = 'mastered';
	} else if (masteryPercent >= 40) {
		fsrsState = 'reviewing';
	}

	return {
		moduleId,
		masteryPercent,
		questionsTotal,
		questionsReviewed,
		questionsDue,
		averageStability,
		fsrsState
	};
}
