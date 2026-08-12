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

	it('handles cold start by returning the root node with foundational reason', () => {
		const emptyMastery = new Map<string, ModuleMastery>();
		const res = getRecommendedNext(mockNodes, mockEdges, emptyMastery);

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-var');
		expect(res?.reason).toContain('foundational topic');
		expect(res?.reason).toContain('Intro to Python');
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
					fsrsState: 'mastered'
				}
			],
			[
				'mod-2',
				{
					moduleId: 'mod-2',
					masteryPercent: 40,
					questionsTotal: 5,
					questionsReviewed: 3,
					questionsDue: 2,
					averageStability: 3,
					fsrsState: 'reviewing'
				}
			],
			[
				'mod-3',
				{
					moduleId: 'mod-3',
					masteryPercent: 0,
					questionsTotal: 5,
					questionsReviewed: 0,
					questionsDue: 5,
					averageStability: 0,
					fsrsState: 'not-started'
				}
			]
		]);

		const res = getRecommendedNext(mockNodes, mockEdges, masteryMap);

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-loop');
		expect(res?.reason).toContain('Prerequisites for "Control Flow" are mastered');
		expect(res?.reason).toContain('module mastery');
	});

	it('recommends least-stable module when all modules are mastered', () => {
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
					fsrsState: 'mastered'
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
					fsrsState: 'mastered'
				}
			]
		]);

		const res = getRecommendedNext(mockNodes.slice(0, 2), mockEdges.slice(0, 1), masteryMap);

		expect(res).not.toBeNull();
		expect(res?.node.id).toBe('c-loop');
		expect(res?.reason).toContain('All modules are currently mastered');
	});
});
