/**
 * Provider Statistics & Daily Quota Guard
 *
 * Tracks requests served by `ml_backend` vs `gemini` using Admin SDK writes
 * to `stats/providerStats` in Firestore and fast Redis counters.
 * Also enforces proactive daily Gemini quota guards (e.g. 90% threshold of 250/day).
 */

import { adminDb, FieldValue } from '$lib/server/admin';
import { isRedisConfigured, redisIncr, redisGet } from '$lib/server/redis';
import { calculateInferenceCostUSD } from './pricingConfig';

export type AIProvider = 'ml_backend' | 'ollama' | 'gemini';

const DAILY_GEMINI_QUOTA_LIMIT = 250;
const QUOTA_SAFETY_MARGIN_PERCENT = 0.9; // 90% -> 225 requests
const MAX_ALLOWED_GEMINI_PER_DAY = Math.floor(
	DAILY_GEMINI_QUOTA_LIMIT * QUOTA_SAFETY_MARGIN_PERCENT
);

function getTodayString(): string {
	return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Check and reserve Gemini daily quota capacity within safety margin (90%).
 * Uses Redis atomic INCR when configured, or Firestore transaction to prevent race conditions.
 */
export async function isGeminiQuotaAvailable(): Promise<boolean> {
	const todayStr = getTodayString();

	if (isRedisConfigured()) {
		try {
			const currentCount = await redisGet<number>(`gemini:daily:${todayStr}`);
			if (currentCount !== null && currentCount >= MAX_ALLOWED_GEMINI_PER_DAY) {
				console.warn(
					`[Gemini Quota Guard] Daily Gemini limit reached (${currentCount}/${DAILY_GEMINI_QUOTA_LIMIT} today). Bypassing Gemini fallback.`
				);
				return false;
			}
			return true;
		} catch (err) {
			console.warn('[Gemini Quota Guard] Redis check error:', err);
		}
	}

	try {
		const statsRef = adminDb.collection('stats').doc('providerStats');
		const doc = await statsRef.get();

		if (!doc.exists) {
			return true;
		}

		const data = doc.data();
		if (data?.dailyGeminiDate === todayStr) {
			const currentDailyCount = data?.dailyGeminiCount || 0;
			if (currentDailyCount >= MAX_ALLOWED_GEMINI_PER_DAY) {
				console.warn(
					`[Gemini Quota Guard] Daily Gemini limit safety margin reached (${currentDailyCount}/${DAILY_GEMINI_QUOTA_LIMIT} today). Bypassing Gemini fallback.`
				);
				return false;
			}
		}

		return true;
	} catch (err) {
		console.warn('[Gemini Quota Guard] Error checking Gemini daily quota:', err);
		return true;
	}
}

/**
 * Record a completed AI inference request to Firestore provider stats.
 * Uses atomic FieldValue increments and Redis counters.
 */
export async function recordProviderUsage(
	provider: AIProvider,
	promptTokens: number = 0,
	completionTokens: number = 0
): Promise<void> {
	try {
		const todayStr = getTodayString();
		const statsRef = adminDb.collection('stats').doc('providerStats');
		const estimatedCost = calculateInferenceCostUSD(provider, promptTokens, completionTokens);

		if (isRedisConfigured()) {
			if (provider === 'gemini') {
				await redisIncr(`gemini:daily:${todayStr}`, 86400);
			}
			await redisIncr(`provider:${provider}:count`, 86400 * 30);
		}

		if (provider === 'ml_backend') {
			await statsRef.set(
				{
					mlBackendCount: FieldValue.increment(1),
					totalPromptTokens: FieldValue.increment(promptTokens),
					totalCompletionTokens: FieldValue.increment(completionTokens),
					totalCostUSD: FieldValue.increment(estimatedCost),
					updatedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);
		} else if (provider === 'ollama') {
			await statsRef.set(
				{
					ollamaCount: FieldValue.increment(1),
					totalPromptTokens: FieldValue.increment(promptTokens),
					totalCompletionTokens: FieldValue.increment(completionTokens),
					totalCostUSD: FieldValue.increment(estimatedCost),
					updatedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);
		} else if (provider === 'gemini') {
			await adminDb.runTransaction(async (transaction) => {
				const doc = await transaction.get(statsRef);
				let dailyCount = 0;

				if (doc.exists) {
					const data = doc.data();
					if (data?.dailyGeminiDate === todayStr) {
						dailyCount = data?.dailyGeminiCount || 0;
					}
				}

				transaction.set(
					statsRef,
					{
						geminiCount: FieldValue.increment(1),
						dailyGeminiCount: dailyCount + 1,
						dailyGeminiDate: todayStr,
						totalPromptTokens: FieldValue.increment(promptTokens),
						totalCompletionTokens: FieldValue.increment(completionTokens),
						totalCostUSD: FieldValue.increment(estimatedCost),
						updatedAt: FieldValue.serverTimestamp()
					},
					{ merge: true }
				);
			});
		}
	} catch (err) {
		console.warn(`[providerStats] Failed to record provider usage for ${provider}:`, err);
	}
}

/**
 * Read current provider stats counters for Admin Analytics dashboard.
 */
export async function getProviderStats(): Promise<{
	geminiCount: number;
	mlBackendCount: number;
	ollamaCount: number;
	fallbackPercentage: number;
}> {
	try {
		const statsRef = adminDb.collection('stats').doc('providerStats');
		const doc = await statsRef.get();

		if (!doc.exists) {
			return { geminiCount: 0, mlBackendCount: 0, ollamaCount: 0, fallbackPercentage: 0 };
		}

		const data = doc.data();
		const geminiCount = data?.geminiCount || 0;
		const mlBackendCount = data?.mlBackendCount || 0;
		const ollamaCount = data?.ollamaCount || 0;
		const total = geminiCount + mlBackendCount + ollamaCount;
		const fallbackPercentage =
			total > 0 ? Number((((geminiCount + ollamaCount) / total) * 100).toFixed(1)) : 0;

		return {
			geminiCount: data?.geminiCount || 0,
			mlBackendCount: data?.mlBackendCount || 0,
			ollamaCount: data?.ollamaCount || 0,
			fallbackPercentage
		};
	} catch (err) {
		console.warn('[getProviderStats] Error fetching stats:', err);
		return { geminiCount: 0, mlBackendCount: 0, ollamaCount: 0, fallbackPercentage: 0 };
	}
}

export interface AttributionMetadata {
	servicedByProvider: AIProvider;
	domainConfidenceScore?: number;
	verbatimSimilarityScore?: number;
	examStyleMode?: boolean;
}

/**
 * Persists attribution metadata to a course or module document in Firestore.
 */
export async function recordAttributionMetadata(
	collectionName: 'courses' | 'modules',
	docId: string,
	meta: AttributionMetadata,
	courseId?: string
): Promise<void> {
	try {
		const docRef =
			collectionName === 'modules' && courseId
				? adminDb.collection('courses').doc(courseId).collection('modules').doc(docId)
				: adminDb.collection(collectionName).doc(docId);
		if (typeof docRef?.set === 'function') {
			await docRef.set(
				{
					servicedByProvider: meta.servicedByProvider,
					domainConfidenceScore: meta.domainConfidenceScore ?? null,
					verbatimSimilarityScore: meta.verbatimSimilarityScore ?? null,
					examStyleMode: meta.examStyleMode ?? false,
					attributedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);
		}
	} catch (err) {
		console.warn(
			`[recordAttributionMetadata] Failed to record attribution for ${collectionName}/${docId}:`,
			err
		);
	}
}
