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
