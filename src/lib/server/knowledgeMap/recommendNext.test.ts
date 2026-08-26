import { describe, it, expect } from 'vitest';
import { getRecommendedNext, type ConceptNode, type PrerequisiteEdge } from './recommendNext';
import type { ModuleMastery } from './masteryCalculator';

describe('getRecommendedNext', () => {
	const mockNodes: ConceptNode[] = [
		{
			id: 'c-var',
			label: 'Variables',
			moduleId: 'mod-1',
			moduleTitle: 'Intro to Python',
			importance: 9
		},
		{ id: 'c-loop', label: 'Loops', moduleId: 'mod-2', moduleTitle: 'Control Flow', importance: 8 },
		{
			id: 'c-func',
			label: 'Functions',
			moduleId: 'mod-3',
			moduleTitle: 'Functions & Scope',
			importance: 10
		}
	];

	const mockEdges: PrerequisiteEdge[] = [
		{ source: 'c-var', target: 'c-loop', relationship: 'prerequisite', confidence: 0.9 },
		{ source: 'c-loop', target: 'c-func', relationship: 'prerequisite', confidence: 0.85 }
	];

	it('handles cold start by returning Priority 4 foundational module recommendation', () => {
		const emptyMastery = new Map<string, ModuleMastery>();
		const res = getRecommendedNext(mockNodes, mockEdges, emptyMastery, 'course-123');

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-var');
		expect(res?.priority).toBe(4);
		expect(res?.type).toBe('continue_learning');
		expect(res?.reason).toContain('foundational topic');
		expect(res?.actionUrl).toBe('/app/courses/course-123/modules/mod-1');
		expect(res?.evidence.length).toBeGreaterThan(0);
	});

	it('prioritizes urgent FSRS review (Priority 1) when questions are due', () => {
		const masteryMap = new Map<string, ModuleMastery>([
			[
				'mod-1',
				{
					moduleId: 'mod-1',
					masteryPercent: 85,
					questionsTotal: 5,
					questionsReviewed: 5,
					questionsDue: 3,
					averageStability: 12,
					fsrsState: 'mastered',
					masteryBreakdown: {
						quizAccuracy: 90,
						fsrsPerformance: 85,
						recencyScore: 90,
						lessonCompletion: 100
					},
					evidenceCount: 5,
					confidenceLevel: 'medium'
				}
			]
		]);

		const res = getRecommendedNext(mockNodes.slice(0, 1), [], masteryMap);
		expect(res).not.toBeNull();
		expect(res?.type).toBe('review');
		expect(res?.priority).toBe(1);
		expect(res?.reason).toContain('3 spaced repetition question(s) due');
	});

	it('recommends prerequisite-ready unmastered module over locked downstream module', () => {
		const masteryMap = new Map<string, ModuleMastery>([
			[
				'mod-1',
				{
					moduleId: 'mod-1',
					masteryPercent: 90,
					questionsTotal: 5,
					questionsReviewed: 5,
					questionsDue: 0,
					averageStability: 12,
					fsrsState: 'mastered',
					masteryBreakdown: {
						quizAccuracy: 90,
						fsrsPerformance: 90,
						recencyScore: 90,
						lessonCompletion: 100
					},
					evidenceCount: 5,
					confidenceLevel: 'medium'
				}
			],
			[
				'mod-2',
				{
					moduleId: 'mod-2',
					masteryPercent: 40,
					questionsTotal: 5,
					questionsReviewed: 3,
					questionsDue: 0,
					averageStability: 3,
					fsrsState: 'reviewing',
					masteryBreakdown: {
						quizAccuracy: 40,
						fsrsPerformance: 40,
						recencyScore: 40,
						lessonCompletion: 80
					},
					evidenceCount: 3,
					confidenceLevel: 'low'
				}
			],
			[
				'mod-3',
				{
					moduleId: 'mod-3',
					masteryPercent: 0,
					questionsTotal: 5,
					questionsReviewed: 0,
					questionsDue: 0,
					averageStability: 0,
					fsrsState: 'not-started',
					masteryBreakdown: {
						quizAccuracy: 0,
						fsrsPerformance: 0,
						recencyScore: 0,
						lessonCompletion: 0
					},
					evidenceCount: 0,
					confidenceLevel: 'none'
				}
			]
		]);

		const res = getRecommendedNext(mockNodes, mockEdges, masteryMap, 'course-abc');

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-loop');
		expect(res?.type).toBe('practice_weak');
		expect(res?.priority).toBe(3);
		expect(res?.reason).toContain('Control Flow');
	});

	it('recommends lowest stability module (Priority 5) when all modules are mastered', () => {
		const masteryMap = new Map<string, ModuleMastery>([
			[
				'mod-1',
				{
					moduleId: 'mod-1',
					masteryPercent: 95,
					questionsTotal: 5,
					questionsReviewed: 5,
					questionsDue: 0,
					averageStability: 20,
					fsrsState: 'mastered',
					masteryBreakdown: {
						quizAccuracy: 95,
						fsrsPerformance: 95,
						recencyScore: 100,
						lessonCompletion: 100
					},
					evidenceCount: 10,
					confidenceLevel: 'medium'
				}
			],
			[
				'mod-2',
				{
					moduleId: 'mod-2',
					masteryPercent: 85,
					questionsTotal: 5,
					questionsReviewed: 5,
					questionsDue: 0,
					averageStability: 5,
					fsrsState: 'mastered',
					masteryBreakdown: {
						quizAccuracy: 85,
						fsrsPerformance: 85,
						recencyScore: 85,
						lessonCompletion: 100
					},
					evidenceCount: 10,
					confidenceLevel: 'medium'
				}
			]
		]);

		const res = getRecommendedNext(mockNodes.slice(0, 2), mockEdges.slice(0, 1), masteryMap);

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-loop');
		expect(res?.priority).toBe(5);
		expect(res?.type).toBe('explore');
		expect(res?.reason).toContain('All modules in this course are mastered');
	});
});
