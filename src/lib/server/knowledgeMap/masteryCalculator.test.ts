import { describe, it, expect } from 'vitest';
import { computeModuleMastery, type QuizQuestion } from './masteryCalculator';

describe('computeModuleMastery', () => {
	const today = '2026-08-10';

	it('returns not-assessed (-1) for empty or missing questions', () => {
		const resNull = computeModuleMastery('mod-1', null, today);
		expect(resNull.masteryPercent).toBe(-1);
		expect(resNull.fsrsState).toBe('not-assessed');
		expect(resNull.confidenceLevel).toBe('none');

		const resEmpty = computeModuleMastery('mod-1', [], today);
		expect(resEmpty.masteryPercent).toBe(-1);
		expect(resEmpty.fsrsState).toBe('not-assessed');
	});

	it('returns not-started (0%) when questions exist but none have been reviewed', () => {
		const questions: QuizQuestion[] = [
			{ prompt: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Exp' },
			{ prompt: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, explanation: 'Exp' }
		];
		const res = computeModuleMastery('mod-1', questions, today);
		expect(res.masteryPercent).toBe(0);
		expect(res.questionsReviewed).toBe(0);
		expect(res.questionsDue).toBe(2);
		expect(res.fsrsState).toBe('not-started');
		expect(res.confidenceLevel).toBe('none');
	});

	it('calculates weighted heuristic mastery and breakdown correctly', () => {
		const questions: QuizQuestion[] = [
			{
				prompt: 'Q1',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 0,
				explanation: 'Exp',
				lastReviewedAt: '2026-08-01',
				nextReviewDate: '2026-08-15',
				fsrsState: 'Review',
				stability: 12,
				attemptCount: 5,
				correctCount: 4
			},
			{
				prompt: 'Q2',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 1,
				explanation: 'Exp',
				lastReviewedAt: '2026-08-05',
				nextReviewDate: '2026-08-09',
				fsrsState: 'Learning',
				stability: 2,
				attemptCount: 3,
				correctCount: 2
			}
		];
		const res = computeModuleMastery('mod-1', questions, today);
		expect(res.masteryPercent).toBeGreaterThan(50);
		expect(res.questionsReviewed).toBe(2);
		expect(res.questionsDue).toBe(1);
		expect(res.masteryBreakdown).toBeDefined();
		expect(res.masteryBreakdown.quizAccuracy).toBe(75); // (4+2)/(5+3) = 75%
		expect(res.confidenceLevel).toBe('medium'); // 8 total interactions
	});

	it('categorizes high mastery with sufficient evidence as high confidence', () => {
		const questions: QuizQuestion[] = [
			{
				prompt: 'Q1',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 0,
				explanation: 'Exp',
				lastReviewedAt: new Date().toISOString(),
				nextReviewDate: '2026-08-20',
				fsrsState: 'Review',
				stability: 15,
				attemptCount: 20,
				correctCount: 19
			}
		];
		const res = computeModuleMastery('mod-1', questions, today, true);
		expect(res.masteryPercent).toBeGreaterThanOrEqual(80);
		expect(res.fsrsState).toBe('mastered');
		expect(res.confidenceLevel).toBe('high');
		expect(res.masteryBreakdown.lessonCompletion).toBe(100);
	});
});
