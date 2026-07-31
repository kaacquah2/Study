/**
 * Weak Topic Detector & Auto-Remediation Service
 *
 * Analyzes user quiz question responses and spaced repetition flashcard lapse logs.
 * Computes topic mastery scores and flags weak topics (< 70% threshold).
 */

export interface QuizAttemptLog {
	topicId: string;
	conceptTag: string;
	isCorrect: boolean;
	timestamp: string;
}

export interface SRSLapseLog {
	topicId: string;
	conceptTag: string;
	rating: number; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
	timestamp: string;
}

export interface TopicMastery {
	topicId: string;
	conceptTag: string;
	totalAttempts: number;
	correctCount: number;
	accuracyPercentage: number;
	isWeakTopic: boolean;
}

const WEAK_TOPIC_THRESHOLD_PERCENT = 70;

/**
 * Analyzes a stream of quiz attempts and SRS logs to determine topic mastery and weak topics.
 */
export function analyzeWeakTopics(
	quizLogs: QuizAttemptLog[],
	srsLogs: SRSLapseLog[] = []
): TopicMastery[] {
	const topicStats: Record<string, { conceptTag: string; total: number; successWeight: number }> =
		{};

	for (const log of quizLogs) {
		const key = `${log.topicId}:${log.conceptTag}`;
		if (!topicStats[key]) {
			topicStats[key] = { conceptTag: log.conceptTag, total: 0, successWeight: 0 };
		}
		topicStats[key].total += 1;
		if (log.isCorrect) {
			topicStats[key].successWeight += 1;
		}
	}

	for (const log of srsLogs) {
		const key = `${log.topicId}:${log.conceptTag}`;
		if (!topicStats[key]) {
			topicStats[key] = { conceptTag: log.conceptTag, total: 0, successWeight: 0 };
		}
		topicStats[key].total += 1;
		// Rating 3 (Good) or 4 (Easy) count as success; 1 (Again) and 2 (Hard) count as lapse
		if (log.rating >= 3) {
			topicStats[key].successWeight += 1;
		} else if (log.rating === 2) {
			topicStats[key].successWeight += 0.5;
		}
	}

	const results: TopicMastery[] = [];

	for (const [key, stats] of Object.entries(topicStats)) {
		const [topicId] = key.split(':');
		const accuracy = stats.total > 0 ? (stats.successWeight / stats.total) * 100 : 100;
		const accuracyPercentage = Number(accuracy.toFixed(1));

		results.push({
			topicId,
			conceptTag: stats.conceptTag,
			totalAttempts: stats.total,
			correctCount: Math.round(stats.successWeight),
			accuracyPercentage,
			isWeakTopic: accuracyPercentage < WEAK_TOPIC_THRESHOLD_PERCENT
		});
	}

	return results.sort((a, b) => a.accuracyPercentage - b.accuracyPercentage);
}
