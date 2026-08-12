import { describe, it, expect } from 'vitest';
import { optimizeFSRSWeights } from '../../../lib/server/fsrs';

describe('Spaced Repetition Deck & Filtering Logic', () => {
	interface QuestionCard {
		courseId: string;
		courseTitle: string;
		moduleId: string;
		moduleTitle: string;
		questionIndex: number;
		question: string;
		options: string[];
		answerIndex: number;
		nextReviewDate?: string;
		isDue: boolean;
	}

	interface DeckInfo {
		courseId: string;
		courseTitle: string;
		moduleId: string;
		moduleTitle: string;
		dueCount: number;
		totalCount: number;
	}

	const mockQuestions: QuestionCard[] = [
		{
			courseId: 'c1',
			courseTitle: 'Biology 101',
			moduleId: 'm1',
			moduleTitle: 'Cell Division Quiz',
			questionIndex: 0,
			question: 'What is Mitosis?',
			options: ['Process of cell division', 'Photosynthesis', 'Respiration'],
			answerIndex: 0,
			nextReviewDate: '2026-08-01',
			isDue: true
		},
		{
			courseId: 'c1',
			courseTitle: 'Biology 101',
			moduleId: 'm1',
			moduleTitle: 'Cell Division Quiz',
			questionIndex: 1,
			question: 'What is Meiosis?',
			options: ['Gamete cell division', 'Protein synthesis', 'Glycolysis'],
			answerIndex: 0,
			nextReviewDate: '2026-08-15',
			isDue: false
		},
		{
			courseId: 'c2',
			courseTitle: 'History 201',
			moduleId: 'm2',
			moduleTitle: 'WWII Quiz',
			questionIndex: 0,
			question: 'When did WWII start?',
			options: ['1939', '1945', '1914'],
			answerIndex: 0,
			nextReviewDate: '2026-08-05',
			isDue: true
		}
	];

	function filterQuestions(
		questions: QuestionCard[],
		courseId?: string,
		moduleId?: string,
		mode: 'due' | 'all' = 'due'
	) {
		return questions.filter((q) => {
			if (courseId && q.courseId !== courseId) return false;
			if (moduleId && q.moduleId !== moduleId) return false;
			if (mode === 'due') return q.isDue;
			return true;
		});
	}

	function buildDecks(questions: QuestionCard[]): DeckInfo[] {
		const deckMap = new Map<string, DeckInfo>();
		for (const q of questions) {
			const key = `${q.courseId}_${q.moduleId}`;
			const existing = deckMap.get(key) || {
				courseId: q.courseId,
				courseTitle: q.courseTitle,
				moduleId: q.moduleId,
				moduleTitle: q.moduleTitle,
				dueCount: 0,
				totalCount: 0
			};
			if (q.isDue) existing.dueCount += 1;
			existing.totalCount += 1;
			deckMap.set(key, existing);
		}
		return Array.from(deckMap.values());
	}

	it('returns all due cards across all courses when no filters are set', () => {
		const filtered = filterQuestions(mockQuestions, '', '', 'due');
		expect(filtered.length).toBe(2);
		expect(filtered.every((q) => q.isDue)).toBe(true);
	});

	it('filters questions by courseId correctly', () => {
		const filtered = filterQuestions(mockQuestions, 'c1', '', 'all');
		expect(filtered.length).toBe(2);
		expect(filtered.every((q) => q.courseId === 'c1')).toBe(true);
	});

	it('filters questions by moduleId correctly', () => {
		const filtered = filterQuestions(mockQuestions, 'c1', 'm1', 'due');
		expect(filtered.length).toBe(1);
		expect(filtered[0].question).toBe('What is Mitosis?');
	});

	it('includes future/non-due cards in practice mode (mode=all)', () => {
		const filtered = filterQuestions(mockQuestions, 'c1', 'm1', 'all');
		expect(filtered.length).toBe(2);
	});

	it('correctly aggregates availableDecks with due and total counts', () => {
		const decks = buildDecks(mockQuestions);
		expect(decks.length).toBe(2);

		const bioDeck = decks.find((d) => d.moduleId === 'm1');
		expect(bioDeck?.dueCount).toBe(1);
		expect(bioDeck?.totalCount).toBe(2);

		const historyDeck = decks.find((d) => d.moduleId === 'm2');
		expect(historyDeck?.dueCount).toBe(1);
		expect(historyDeck?.totalCount).toBe(1);
	});

	it('computes correct FSRS stats structure from review log entries', () => {
		const sampleLogs = [
			{
				courseId: 'c1',
				moduleId: 'm1',
				questionIndex: 0,
				quality: 4,
				elapsedDays: 1,
				predictedRetrievability: 0.9,
				newStability: 3.5,
				newDifficulty: 5.0,
				timestamp: '2026-08-01'
			}
		];
		const result = optimizeFSRSWeights(sampleLogs);
		expect(result.sampleCount).toBe(1);
		expect(result.averageRetention).toBe(1.0);
		expect(result.isCalibrated).toBe(false);
	});
});
