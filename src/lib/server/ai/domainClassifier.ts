/**
 * Domain Classifier — Step 1 Topic Domain Verification
 *
 * Evaluates whether a user-submitted topic falls within our fine-tuned CS course dataset domain.
 * If in-domain (confidence >= DOMAIN_CONFIDENCE_THRESHOLD), routes to ml_backend fine-tuned model first.
 * If out-of-domain, routes directly to Gemini Flash to avoid degraded local model responses.
 */

import { adminDb } from '../admin';
import { FieldValue } from 'firebase-admin/firestore';

export const CS_TAXONOMY_TOPICS = [
	'Data Structures & Algorithms',
	'Operating Systems',
	'Computer Networks & Protocols',
	'Database Management Systems',
	'Computer Architecture & Assembly',
	'Discrete Mathematics & Graph Theory',
	'Software Engineering & System Design',
	'Object-Oriented Programming in Java/C++',
	'Compilers & Automata Theory',
	'Cybersecurity & Cryptography Fundamentals'
];

/**
 * Calculates a lightweight token-Jaccard + keyword overlap similarity score (0 to 1)
 */
export function calculateDomainConfidence(userTopic: string): {
	confidence: number;
	matchedTopic: string | null;
} {
	const normalize = (str: string) =>
		str
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter((w) => w.length > 2);

	const topicTokens = new Set(normalize(userTopic));
	if (topicTokens.size === 0) return { confidence: 0, matchedTopic: null };

	let maxScore = 0;
	let bestMatch: string | null = null;

	for (const taxonomyTopic of CS_TAXONOMY_TOPICS) {
		const taxTokens = new Set(normalize(taxonomyTopic));
		let intersection = 0;

		for (const token of topicTokens) {
			if (taxTokens.has(token)) {
				intersection++;
			}
		}

		// Jaccard similarity weighted towards user topic token coverage
		const userCoverage = intersection / topicTokens.size;
		const taxCoverage = intersection / taxTokens.size;
		const combinedScore = userCoverage * 0.7 + taxCoverage * 0.3;

		if (combinedScore > maxScore) {
			maxScore = combinedScore;
			bestMatch = taxonomyTopic;
		}
	}

	return {
		confidence: Math.min(1.0, Math.max(0.0, maxScore)),
		matchedTopic: bestMatch
	};
}

export interface DomainClassificationResult {
	inDomain: boolean;
	confidence: number;
	matchedTopic: string | null;
	thresholdUsed: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Gets the current domain confidence threshold from env or default
 */
export function getDomainConfidenceThreshold(): number {
	const envVal =
		typeof process !== 'undefined' && process.env
			? process.env.DOMAIN_CONFIDENCE_THRESHOLD
			: undefined;
	if (envVal) {
		const parsed = parseFloat(envVal);
		if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
			return parsed;
		}
	}
	return DEFAULT_CONFIDENCE_THRESHOLD;
}

/**
 * Classifies a user topic string against the CS curriculum taxonomy.
 */
export function classifyTopicDomain(userTopic: string): DomainClassificationResult {
	const threshold = getDomainConfidenceThreshold();
	const { confidence, matchedTopic } = calculateDomainConfidence(userTopic);

	return {
		inDomain: confidence >= threshold,
		confidence,
		matchedTopic,
		thresholdUsed: threshold
	};
}

/**
 * Logs unmatched / low-confidence user topic requests to Firestore `analytics/topic_gaps`.
 * This acts as a prioritised growth feedback loop for future PDF training set collection.
 */
export async function logTopicGap(topic: string, confidence: number): Promise<void> {
	if (!adminDb || process.env.NODE_ENV === 'test') return;

	try {
		const normalizedTopic = topic.trim().toLowerCase();
		const docRef = adminDb
			.collection('analytics')
			.doc('topic_gaps')
			.collection('unmatched_topics')
			.doc(encodeURIComponent(normalizedTopic.slice(0, 50)));

		await docRef.set(
			{
				rawTopic: topic,
				lastConfidence: confidence,
				searchCount: FieldValue.increment(1),
				lastSearchedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);
	} catch (err) {
		console.warn('[domainClassifier] Failed to log topic gap:', err);
	}
}
