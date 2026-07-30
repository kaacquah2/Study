/**
 * Memorization Guard — Verbatim Overlap & Leakage Scanner
 *
 * Scans generated content (lesson body, quiz questions) against reference texts
 * or training corpus fragments using 5-gram overlap and continuous substring matching.
 * Prevents near-verbatim memorized lecture note / exam question output from being saved to Firestore.
 */

export interface MemorizationCheckResult {
	verbatimSimilarityScore: number; // 0.0 to 1.0 (5-gram Jaccard overlap ratio)
	isVerbatimMatch: boolean; // True if similarity > threshold or continuous exact match found
	matchedPhrases: string[];
	actionTaken: 'passed' | 'flagged' | 'sanitized';
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.2; // 20% 5-gram overlap
const CONTINUOUS_WORD_MATCH_THRESHOLD = 15; // 15 consecutive identical words

/**
 * Extracts normalized n-grams of specified size from text.
 */
function extractNGrams(text: string, n = 5): Set<string> {
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.split(/\s+/)
		.filter((w) => w.length > 0);

	const nGrams = new Set<string>();
	for (let i = 0; i <= words.length - n; i++) {
		nGrams.add(words.slice(i, i + n).join(' '));
	}
	return nGrams;
}

/**
 * Checks for verbatim or near-verbatim overlap between generated content and reference source material.
 */
export function checkMemorization(
	generatedText: string,
	referenceSourceText?: string | null,
	threshold = DEFAULT_SIMILARITY_THRESHOLD
): MemorizationCheckResult {
	if (!generatedText || !referenceSourceText) {
		return {
			verbatimSimilarityScore: 0,
			isVerbatimMatch: false,
			matchedPhrases: [],
			actionTaken: 'passed'
		};
	}

	const genNGrams = extractNGrams(generatedText, 5);
	const refNGrams = extractNGrams(referenceSourceText, 5);

	if (genNGrams.size === 0 || refNGrams.size === 0) {
		return {
			verbatimSimilarityScore: 0,
			isVerbatimMatch: false,
			matchedPhrases: [],
			actionTaken: 'passed'
		};
	}

	let intersectionCount = 0;
	const matchedPhrases: string[] = [];

	for (const nGram of genNGrams) {
		if (refNGrams.has(nGram)) {
			intersectionCount++;
			if (matchedPhrases.length < 5) {
				matchedPhrases.push(nGram);
			}
		}
	}

	const score = Number((intersectionCount / genNGrams.size).toFixed(3));

	// Continuous long substring check
	const genWords = generatedText
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.split(/\s+/);
	const refWordsStr = referenceSourceText.toLowerCase().replace(/[^a-z0-9\s]/g, '');

	let maxContinuousMatch = 0;
	for (let i = 0; i <= genWords.length - CONTINUOUS_WORD_MATCH_THRESHOLD; i++) {
		const phrase = genWords.slice(i, i + CONTINUOUS_WORD_MATCH_THRESHOLD).join(' ');
		if (refWordsStr.includes(phrase.replace(/\s+/g, ''))) {
			maxContinuousMatch = CONTINUOUS_WORD_MATCH_THRESHOLD;
			if (!matchedPhrases.includes(phrase)) {
				matchedPhrases.push(phrase);
			}
			break;
		}
	}

	const isMatch = score >= threshold || maxContinuousMatch >= CONTINUOUS_WORD_MATCH_THRESHOLD;

	return {
		verbatimSimilarityScore: score,
		isVerbatimMatch: isMatch,
		matchedPhrases,
		actionTaken: isMatch ? 'flagged' : 'passed'
	};
}
