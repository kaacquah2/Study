import { describe, it, expect } from 'vitest';
import { calculateFSRS, type FSRSCard } from './fsrs';

export interface PendingReviewLog {
	cardId: string;
	rating: number; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
	reviewedAt: string;
}

/**
 * Replays offline reviews in chronological order against FSRS state.
 */
export function replayOfflineReviews(initialCard: FSRSCard, logs: PendingReviewLog[]): FSRSCard {
	const sortedLogs = [...logs].sort(
		(a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
	);

	let currentCard = { ...initialCard };

	for (const log of sortedLogs) {
		const reviewDate = new Date(log.reviewedAt);
		const result = calculateFSRS({ quality: log.rating, card: currentCard }, reviewDate);
		currentCard = result.card;
	}

	return currentCard;
}

describe('Offline Review Replay Engine', () => {
	it('replays offline reviews in exact chronological order without corrupting state', () => {
		const initialCard: FSRSCard = {
			stability: 0,
			difficulty: 5,
			reps: 0,
			lapses: 0,
			state: 'New',
			lastReview: null
		};

		// Logs added out of chronological order
		const outOfOrderLogs: PendingReviewLog[] = [
			{ cardId: 'c1', rating: 4, reviewedAt: '2026-07-30T14:00:00Z' },
			{ cardId: 'c1', rating: 3, reviewedAt: '2026-07-30T10:00:00Z' }
		];

		const finalState = replayOfflineReviews(initialCard, outOfOrderLogs);

		expect(finalState.reps).toBe(2);
		expect(finalState.state).toBe('Review');
		expect(new Date(finalState.lastReview!).getTime()).toBe(
			new Date('2026-07-30T14:00:00Z').getTime()
		);
	});
});
