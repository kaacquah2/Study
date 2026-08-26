import { describe, it, expect } from 'vitest';
import { flashcardService } from './flashcardService';

describe('FlashcardApplicationService', () => {
	it('processes FSRS review calculation with rating 3 (Good)', () => {
		const result = flashcardService.processReview({
			cardId: 'card_123',
			quality: 4,
			algorithm: 'fsrs',
			fsrsCard: {
				stability: 0,
				difficulty: 5,
				reps: 0,
				lapses: 0,
				state: 'New',
				lastReview: null
			}
		});

		expect(result.cardId).toBe('card_123');
		expect(result.algorithm).toBe('fsrs');
		expect(result.intervalDays).toBeGreaterThan(0);
		expect(result.fsrs?.state).toBe('Review');
		expect(result.fsrs?.reps).toBe(1);
	});

	it('processes SM2 review calculation with quality 5', () => {
		const result = flashcardService.processReview({
			cardId: 'card_456',
			quality: 5,
			algorithm: 'sm2',
			sm2Card: {
				interval: 1,
				repetitions: 1,
				easeFactor: 2.5
			}
		});

		expect(result.cardId).toBe('card_456');
		expect(result.algorithm).toBe('sm2');
		expect(result.intervalDays).toBe(6);
		expect(result.sm2?.repetitions).toBe(2);
	});


	it('resolves concept and builds deterministic dedup key', () => {
		const result = flashcardService.resolveConceptAndDedupKey({
			courseId: 'cs101',
			moduleId: 'mod2',
			highlightText: 'quick sort partition algorithm',
			canonicalConcepts: [
				{
					id: 'concept_quicksort',
					term: 'Quicksort',
					aliases: ['quick sort', 'quicksort partition', 'hoare partition']
				}
			]
		});

		expect(result.conceptId).toBe('concept_quicksort');
		expect(result.dedupKey).toBe('cs101:mod2:concept_quicksort');
		expect(result.isProvisional).toBe(false);
	});
});
