/**
 * Module Mastery Calculator — Adaptive AI Learning System
 *
 * HEURISTIC MASTERY FORMULA & ACADEMIC RATIONALE:
 * ─────────────────────────────────────────────────────────────────────────────
 * Mastery is estimated as a multi-signal heuristic approximation rather than an
 * uncalibrated statistical certainty:
 *
 *   Mastery Score = 0.45 × Quiz Accuracy
 *                 + 0.35 × FSRS Performance
 *                 + 0.15 × Recency Score
 *                 + 0.05 × Lesson Completion
 *
 * Weight Rationale:
 * 1. Quiz Accuracy (45%): Direct active-recall performance is the strongest
 *    empirical evidence of concept comprehension.
 * 2. FSRS Performance (35%): Free Spaced Repetition Scheduling retention states
 *    reflect memory consolidation over time.
 * 3. Recency Score (15%): Recent engagement rewards active retention and penalizes
 *    knowledge decay.
 * 4. Lesson Completion (5%): Passive reading does not prove understanding;
 *    hence it receives the lowest weighting.
 *
 * Confidence Calibration:
 * - 'high': >= 15 questions / review interactions
 * - 'medium': 5–14 interactions
 * - 'low': 1–4 interactions
 * - 'none': 0 interactions (unassessed / not-started)
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
	correctCount?: number;
	attemptCount?: number;
}

export interface MasteryBreakdown {
	quizAccuracy: number; // 0-100 (Weight: 45%)
	fsrsPerformance: number; // 0-100 (Weight: 35%)
	recencyScore: number; // 0-100 (Weight: 15%)
	lessonCompletion: number; // 0-100 (Weight: 5%)
}

export interface ModuleMastery {
	moduleId: string;
	masteryPercent: number; // -1 for not-assessed, 0-100 otherwise
	questionsTotal: number;
	questionsReviewed: number;
	questionsDue: number;
	averageStability: number;
	fsrsState: 'not-assessed' | 'not-started' | 'learning' | 'reviewing' | 'mastered';
	masteryBreakdown: MasteryBreakdown;
	evidenceCount: number;
	confidenceLevel: 'high' | 'medium' | 'low' | 'none';
}

const FSRS_STATE_WEIGHTS: Record<string, number> = {
	New: 0,
	Learning: 0.4,
	Review: 0.8,
	Review_high: 1.0, // Stability >= 10 days
	Relearning: 0.2
};

export function computeModuleMastery(
	moduleId: string,
	questions: QuizQuestion[] | null | undefined,
	todayStr: string = new Date().toISOString().split('T')[0],
	isLessonCompleted: boolean = false
): ModuleMastery {
	// Default breakdown for unassessed / not-started
	const defaultBreakdown: MasteryBreakdown = {
		quizAccuracy: 0,
		fsrsPerformance: 0,
		recencyScore: 0,
		lessonCompletion: isLessonCompleted ? 100 : 0
	};

	// Case 1: Pure lesson module or no quiz questions -> not-assessed
	if (!questions || !Array.isArray(questions) || questions.length === 0) {
		return {
			moduleId,
			masteryPercent: isLessonCompleted ? 100 : -1,
			questionsTotal: 0,
			questionsReviewed: 0,
			questionsDue: 0,
			averageStability: 0,
			fsrsState: 'not-assessed',
			masteryBreakdown: defaultBreakdown,
			evidenceCount: isLessonCompleted ? 1 : 0,
			confidenceLevel: isLessonCompleted ? 'low' : 'none'
		};
	}

	const questionsTotal = questions.length;
	let questionsReviewed = 0;
	let questionsDue = 0;
	let totalStability = 0;
	let totalFsrsWeight = 0;
	let totalCorrectAttempts = 0;
	let totalAttemptsCount = 0;
	let mostRecentReviewEpoch = 0;

	for (const q of questions) {
		const isReviewed = Boolean(q.lastReviewedAt);
		const isDue = !q.nextReviewDate || q.nextReviewDate <= todayStr;

		if (isDue) {
			questionsDue += 1;
		}

		if (q.lastReviewedAt) {
			const epoch = new Date(q.lastReviewedAt).getTime();
			if (!isNaN(epoch) && epoch > mostRecentReviewEpoch) {
				mostRecentReviewEpoch = epoch;
			}
		}

		// Accuracy tracking per question
		if (typeof q.attemptCount === 'number' && q.attemptCount > 0) {
			totalAttemptsCount += q.attemptCount;
			totalCorrectAttempts += q.correctCount || 0;
		} else if (isReviewed) {
			totalAttemptsCount += 1;
			// If in Review or mastered, assume correct; if Relearning, assume lapsed
			if (q.fsrsState === 'Review') {
				totalCorrectAttempts += 1;
			}
		}

		if (isReviewed) {
			questionsReviewed += 1;
			const stability = typeof q.stability === 'number' ? q.stability : 0;
			totalStability += stability;

			const state = q.fsrsState || 'Learning';
			if (state === 'Review') {
				totalFsrsWeight +=
					stability >= 10 ? FSRS_STATE_WEIGHTS.Review_high : FSRS_STATE_WEIGHTS.Review;
			} else if (state === 'Learning') {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.Learning;
			} else if (state === 'Relearning') {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.Relearning;
			} else {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.New;
			}
		} else {
			totalFsrsWeight += FSRS_STATE_WEIGHTS.New;
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
			fsrsState: 'not-started',
			masteryBreakdown: defaultBreakdown,
			evidenceCount: 0,
			confidenceLevel: 'none'
		};
	}

	// Component 1: Quiz Accuracy (0-100)
	const rawAccuracy =
		totalAttemptsCount > 0
			? (totalCorrectAttempts / totalAttemptsCount) * 100
			: (totalFsrsWeight / questionsTotal) * 100;
	const quizAccuracy = Math.min(100, Math.max(0, Math.round(rawAccuracy)));

	// Component 2: FSRS Memory Performance (0-100)
	const fsrsPerformance = Math.min(
		100,
		Math.max(0, Math.round((totalFsrsWeight / questionsTotal) * 100))
	);

	// Component 3: Recency Score (0-100) — based on days since last review
	let recencyScore: number;
	if (mostRecentReviewEpoch > 0) {
		const daysSinceReview = Math.max(
			0,
			(Date.now() - mostRecentReviewEpoch) / (1000 * 60 * 60 * 24)
		);
		if (daysSinceReview > 30) {
			recencyScore = 20;
		} else if (daysSinceReview > 14) {
			recencyScore = 50;
		} else if (daysSinceReview > 7) {
			recencyScore = 75;
		} else {
			recencyScore = 100;
		}
	} else {
		recencyScore = 50;
	}

	// Component 4: Lesson Completion (0-100)
	const lessonCompletion = isLessonCompleted ? 100 : questionsReviewed > 0 ? 80 : 0;

	// Composite Weighted Formula: 0.45 * Quiz + 0.35 * FSRS + 0.15 * Recency + 0.05 * Lesson
	const compositeScore =
		0.45 * quizAccuracy + 0.35 * fsrsPerformance + 0.15 * recencyScore + 0.05 * lessonCompletion;

	const masteryPercent = Math.min(100, Math.max(0, Math.round(compositeScore)));
	const averageStability = Number((totalStability / questionsReviewed).toFixed(1));

	// Evidence Count & Confidence Level
	const evidenceCount = totalAttemptsCount > 0 ? totalAttemptsCount : questionsReviewed;
	let confidenceLevel: ModuleMastery['confidenceLevel'];
	if (evidenceCount >= 15) {
		confidenceLevel = 'high';
	} else if (evidenceCount >= 5) {
		confidenceLevel = 'medium';
	} else if (evidenceCount >= 1) {
		confidenceLevel = 'low';
	} else {
		confidenceLevel = 'none';
	}

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
		fsrsState,
		masteryBreakdown: {
			quizAccuracy,
			fsrsPerformance,
			recencyScore,
			lessonCompletion
		},
		evidenceCount,
		confidenceLevel
	};
}
