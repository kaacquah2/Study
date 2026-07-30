import { describe, it, expect } from 'vitest';
import { checkMemorization } from './memorizationGuard';

describe('MemorizationGuard Unit Tests', () => {
	it('returns passed status when there is no reference text', () => {
		const result = checkMemorization(
			'This is a newly generated lesson page about binary search trees.'
		);
		expect(result.isVerbatimMatch).toBe(false);
		expect(result.verbatimSimilarityScore).toBe(0);
		expect(result.actionTaken).toBe('passed');
	});

	it('detects high 5-gram overlap between generated text and reference source', () => {
		const refText =
			'Binary search trees maintain a sorted invariant where the left child is smaller and the right child is greater.';
		const genText =
			'Binary search trees maintain a sorted invariant where the left child is smaller and the right child is greater.';

		const result = checkMemorization(genText, refText);
		expect(result.isVerbatimMatch).toBe(true);
		expect(result.verbatimSimilarityScore).toBeGreaterThan(0.5);
		expect(result.actionTaken).toBe('flagged');
	});

	it('passes when generated text has distinct phrasing', () => {
		const refText =
			'Binary search trees maintain a sorted invariant where the left child is smaller.';
		const genText =
			'A BST organizes numbers hierarchically by keeping lower values on left nodes and higher on right.';

		const result = checkMemorization(genText, refText);
		expect(result.isVerbatimMatch).toBe(false);
		expect(result.actionTaken).toBe('passed');
	});
});
