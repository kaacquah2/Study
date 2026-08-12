import { describe, it, expect } from 'vitest';
import { computeModuleMastery, type QuizQuestion } from './masteryCalculator';

describe('computeModuleMastery', () => {
	const today = '2026-08-10';

	it('returns not-assessed (-1) for empty or missing questions', () => {
		const resNull = computeModuleMastery('mod-1', null, today);
		expect(resNull.masteryPercent).toBe(-1);
		expect(resNull.fsrsState).toBe('not-assessed');

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
	});

	it('calculates weighted mastery for reviewed questions correctly', () => {
		const questions: QuizQuestion[] = [
			{
				prompt: 'Q1',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 0,
				explanation: 'Exp',
				lastReviewedAt: '2026-08-01',
				nextReviewDate: '2026-08-15',
				fsrsState: 'Review',
				stability: 12
			}, // Weight 1.0, due: false
			{
				prompt: 'Q2',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 1,
				explanation: 'Exp',
				lastReviewedAt: '2026-08-05',
				nextReviewDate: '2026-08-09',
				fsrsState: 'Learning',
				stability: 2
			} // Weight 0.4, due: true (2026-08-09 <= 2026-08-10)
		];
		const res = computeModuleMastery('mod-1', questions, today);
		// (1.0 + 0.4) / 2 = 0.7 -> 70%
		expect(res.masteryPercent).toBe(70);
		expect(res.questionsReviewed).toBe(2);
		expect(res.questionsDue).toBe(1);
		expect(res.fsrsState).toBe('reviewing');
	});

	it('categorizes high mastery (>=80%) as mastered', () => {
		const questions: QuizQuestion[] = [
			{
				prompt: 'Q1',
				options: ['A', 'B', 'C', 'D'],
				correctIndex: 0,
				explanation: 'Exp',
				lastReviewedAt: '2026-08-01',
				nextReviewDate: '2026-08-20',
				fsrsState: 'Review',
				stability: 15
			}
		];
		const res = computeModuleMastery('mod-1', questions, today);
		expect(res.masteryPercent).toBe(100);
		expect(res.fsrsState).toBe('mastered');
	});
});
