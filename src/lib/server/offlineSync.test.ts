import { describe, it, expect } from 'vitest';
import type { FSRSCard } from './fsrs';
import { replayOfflineReviews, type PendingReviewLog } from './offlineSync';

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
