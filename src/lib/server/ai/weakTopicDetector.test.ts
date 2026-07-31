import { describe, it, expect } from 'vitest';
import { analyzeWeakTopics, type QuizAttemptLog, type SRSLapseLog } from './weakTopicDetector';

describe('Weak Topic Detector Service', () => {
	it('correctly flags topics with accuracy below 70% threshold', () => {
		const quizLogs: QuizAttemptLog[] = [
			{
				topicId: 'memory-management',
				conceptTag: 'paging-vs-segmentation',
				isCorrect: false,
				timestamp: '2026-07-30T10:00:00Z'
			},
			{
				topicId: 'memory-management',
				conceptTag: 'paging-vs-segmentation',
				isCorrect: false,
				timestamp: '2026-07-30T10:05:00Z'
			},
			{
				topicId: 'memory-management',
				conceptTag: 'paging-vs-segmentation',
				isCorrect: false,
				timestamp: '2026-07-30T10:10:00Z'
			},
			{
				topicId: 'memory-management',
				conceptTag: 'paging-vs-segmentation',
				isCorrect: true,
				timestamp: '2026-07-30T10:15:00Z'
			},
			{
				topicId: 'cpu-scheduling',
				conceptTag: 'round-robin',
				isCorrect: true,
				timestamp: '2026-07-30T10:20:00Z'
			},
			{
				topicId: 'cpu-scheduling',
				conceptTag: 'round-robin',
				isCorrect: true,
				timestamp: '2026-07-30T10:25:00Z'
			}
		];

		const srsLogs: SRSLapseLog[] = [
			{
				topicId: 'memory-management',
				conceptTag: 'paging-vs-segmentation',
				rating: 1,
				timestamp: '2026-07-30T11:00:00Z'
			}
		];

		const masteryList = analyzeWeakTopics(quizLogs, srsLogs);

		expect(masteryList.length).toBe(2);

		const memoryTopic = masteryList.find((m) => m.conceptTag === 'paging-vs-segmentation');
		expect(memoryTopic).toBeDefined();
		expect(memoryTopic?.isWeakTopic).toBe(true);
		expect(memoryTopic?.accuracyPercentage).toBeLessThan(70);

		const cpuTopic = masteryList.find((m) => m.conceptTag === 'round-robin');
		expect(cpuTopic).toBeDefined();
		expect(cpuTopic?.isWeakTopic).toBe(false);
		expect(cpuTopic?.accuracyPercentage).toBe(100);
	});
});
