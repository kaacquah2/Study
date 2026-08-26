import { calculateFSRS, type FSRSCard, type FSRSOutput } from '../domain/fsrs/fsrsEngine';
import { calculateSM2, type SM2Input, type SM2Output } from '../sm2';
import { generateCardDedupKey, resolveConceptTaxonomy, type CanonicalConcept, type ProvisionalConcept } from '../domain/course/taxonomy';

export interface ReviewSubmission {
	cardId: string;
	quality: number; // 0-5
	currentDate?: Date;
	algorithm?: 'fsrs' | 'sm2';
	fsrsCard?: Partial<FSRSCard>;
	sm2Card?: Partial<SM2Input>;
}


export interface ReviewResult {
	cardId: string;
	algorithm: 'fsrs' | 'sm2';
	intervalDays: number;
	nextReviewDate: string;
	fsrs?: FSRSOutput['card'];
	sm2?: SM2Output;
}

export class FlashcardApplicationService {
	/**
	 * Process a flashcard spaced-repetition review using FSRS or SM2.
	 */
	public processReview(submission: ReviewSubmission): ReviewResult {
		const algorithm = submission.algorithm || 'fsrs';
		const currentDate = submission.currentDate || new Date();

		if (algorithm === 'fsrs') {
			const output = calculateFSRS(
				{
					quality: submission.quality,
					card: submission.fsrsCard
				},
				currentDate
			);

			return {
				cardId: submission.cardId,
				algorithm: 'fsrs',
				intervalDays: output.intervalDays,
				nextReviewDate: output.nextReviewDate,
				fsrs: output.card
			};
		} else {
			const output = calculateSM2(
				{
					quality: submission.quality,
					repetitions: submission.sm2Card?.repetitions || 0,
					interval: submission.sm2Card?.interval || 0,
					easeFactor: submission.sm2Card?.easeFactor || 2.5
				},
				currentDate
			);


			return {
				cardId: submission.cardId,
				algorithm: 'sm2',
				intervalDays: output.interval,
				nextReviewDate: output.nextReviewDate,
				sm2: output
			};
		}
	}

	/**
	 * Resolve highlighted student text or quiz miss term to a canonical concept ID
	 * and return the deduplication key to prevent duplicate flashcards.
	 */
	public resolveConceptAndDedupKey(params: {
		courseId: string;
		moduleId: string;
		highlightText: string;
		canonicalConcepts: CanonicalConcept[];
		existingProvisionalConcepts?: ProvisionalConcept[];
	}): { conceptId: string; dedupKey: string; isProvisional: boolean; matchStage: string } {
		const resolution = resolveConceptTaxonomy({
			inputText: params.highlightText,
			canonicalConcepts: params.canonicalConcepts,
			existingProvisionalConcepts: params.existingProvisionalConcepts
		});

		const dedupKey = generateCardDedupKey(params.courseId, params.moduleId, resolution.conceptId);

		return {
			conceptId: resolution.conceptId,
			dedupKey,
			isProvisional: resolution.isProvisional,
			matchStage: resolution.matchStage
		};
	}
}

export const flashcardService = new FlashcardApplicationService();
