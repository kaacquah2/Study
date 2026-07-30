/**
 * Domain Classifier — Step 1 Topic Domain Verification
 *
 * Evaluates whether a user-submitted topic falls within our fine-tuned CS course dataset domain.
 * If in-domain (confidence >= DOMAIN_CONFIDENCE_THRESHOLD), routes to ml_backend fine-tuned model first.
 * If out-of-domain, routes directly to Gemini Flash to avoid degraded local model responses.
 */

import {
	CS_TAXONOMY_TOPICS,
	calculateDomainConfidence
} from '../../../../scripts/calibrate_domain_classifier';
import { adminDb } from '../admin';
import { FieldValue } from 'firebase-admin/firestore';

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
	const envVal = process.env.DOMAIN_CONFIDENCE_THRESHOLD;
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

export { CS_TAXONOMY_TOPICS };
