import { describe, it, expect } from 'vitest';
import {
	resolveConceptTaxonomy,
	computeTokenJaccard,
	computeCosineSimilarity,
	generateCardDedupKey,
	type CanonicalConcept,
	type ProvisionalConcept
} from './taxonomy';

describe('Canonical Concept Taxonomy Resolver & Deduplication', () => {
	const canonicalConcepts: CanonicalConcept[] = [
		{
			id: 'concept_binary_search',
			term: 'Binary Search',
			aliases: ['binary search algorithm', 'logarithmic search', 'bsearch'],
			summary: 'Divide and conquer search on sorted arrays with O(log n) time complexity.'
		},
		{
			id: 'concept_hash_map',
			term: 'Hash Map',
			aliases: ['hash table', 'hash dictionary', 'hash map lookup'],
			summary: 'Key-value data structure with amortized O(1) lookups.'
		},
		{
			id: 'concept_depth_first_search',
			term: 'Depth-First Search',
			aliases: ['dfs', 'depth first traversal'],
			summary: 'Graph traversal algorithm exploring deep before backtracking.'
		}
	];

	it('computes token Jaccard similarity accurately', () => {
		const score1 = computeTokenJaccard('binary search', 'binary search');
		expect(score1).toBe(1.0);

		const score2 = computeTokenJaccard('binary search algorithm', 'binary search');
		expect(score2).toBeGreaterThanOrEqual(0.65);

		const score3 = computeTokenJaccard('completely unrelated', 'hash map');

		expect(score3).toBe(0);
	});

	it('computes cosine similarity accurately', () => {
		const vecA = [1, 0, 0];
		const vecB = [1, 0, 0];
		const vecC = [0, 1, 0];

		expect(computeCosineSimilarity(vecA, vecB)).toBe(1.0);
		expect(computeCosineSimilarity(vecA, vecC)).toBe(0.0);
	});

	it('Stage 1: Matches exact term and aliases with 1.0 confidence', () => {
		// Exact term
		const res1 = resolveConceptTaxonomy({
			inputText: 'Binary Search',
			canonicalConcepts
		});
		expect(res1.conceptId).toBe('concept_binary_search');
		expect(res1.matchStage).toBe('exact_alias');
		expect(res1.confidence).toBe(1.0);
		expect(res1.isProvisional).toBe(false);

		// Exact alias (case-insensitive & punctuation stripped)
		const res2 = resolveConceptTaxonomy({
			inputText: 'logarithmic search!',
			canonicalConcepts
		});
		expect(res2.conceptId).toBe('concept_binary_search');
		expect(res2.matchStage).toBe('exact_alias');
	});

	it('Stage 2: Matches via token Jaccard overlap (score >= 0.65)', () => {
		const res = resolveConceptTaxonomy({
			inputText: 'hash table data structure',
			canonicalConcepts
		});
		expect(res.conceptId).toBe('concept_hash_map');
		expect(res.matchStage).toBe('token_jaccard');
		expect(res.confidence).toBeGreaterThanOrEqual(0.65);
		expect(res.isProvisional).toBe(false);
	});

	it('Stage 3: Matches via canonical embedding cosine similarity (score > 0.82)', () => {
		const conceptEmbeddings = new Map<string, number[]>([
			['concept_depth_first_search', [0.95, 0.1, 0.05]],
			['concept_hash_map', [0.1, 0.9, 0.1]]
		]);
		const inputEmbedding = [0.94, 0.11, 0.04]; // Close to DFS

		const res = resolveConceptTaxonomy({
			inputText: 'exploring branches recursively to leaves',
			canonicalConcepts,
			conceptEmbeddings,
			inputEmbedding
		});

		expect(res.conceptId).toBe('concept_depth_first_search');
		expect(res.matchStage).toBe('embedding_cosine');
		expect(res.confidence).toBeGreaterThan(0.82);
	});

	it('Stage 4: Reconciles against existing provisional concepts to prevent card duplication', () => {
		const existingProvisionalConcepts: ProvisionalConcept[] = [
			{
				id: 'concept_custom_amortized_cost',
				term: 'amortized analysis cost breakdown',
				createdAt: Date.now() - 10000
			}
		];

		// Second student highlights similar phrase: should reuse existing provisional concept!
		const res = resolveConceptTaxonomy({
			inputText: 'amortized analysis breakdown',
			canonicalConcepts,
			existingProvisionalConcepts
		});

		expect(res.conceptId).toBe('concept_custom_amortized_cost');
		expect(res.matchStage).toBe('provisional_cosine');
		expect(res.isProvisional).toBe(true);
	});

	it('Stage 5: Mints a deterministic module-scoped provisional concept when novel', () => {
		const res = resolveConceptTaxonomy({
			inputText: 'Red-black tree tree rotation balance factor',
			canonicalConcepts,
			existingProvisionalConcepts: []
		});

		expect(res.conceptId).toMatch(/^concept_custom_[a-f0-9]{10}$/);
		expect(res.matchStage).toBe('minted_provisional');
		expect(res.isProvisional).toBe(true);
	});

	it('generates consistent deduplication keys format: courseId:moduleId:conceptId', () => {
		const key = generateCardDedupKey('course_algo_101', 'mod_sorting', 'concept_binary_search');
		expect(key).toBe('course_algo_101:mod_sorting:concept_binary_search');
	});
});
