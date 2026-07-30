import { adminDb } from './admin';
import { isRedisConfigured, redisIncr } from './redis';

/**
 * Enforces a rate limit on a given document reference atomically via Redis or inside a Firestore transaction.
 * @param docRef DocumentReference to update
 * @param limit Maximum allowed actions in the window
 * @param windowKey The key identifier for the current window (e.g. hourly string or daily string)
 * @param countField The field storing the count
 * @param windowField The field storing the window key
 */
export async function enforceRateLimit(
	docRef: FirebaseFirestore.DocumentReference,
	limit: number,
	windowKey: string,
	countField: string,
	windowField: string,
	windowTtlSeconds?: number
): Promise<void> {
	// If Redis is configured, use distributed fast rate limiting
	if (isRedisConfigured()) {
		const redisKey = `ratelimit:${docRef.path}:${countField}:${windowKey}`;
		// Derive TTL: default to 86400s (24h) if YYYY-MM-DD pattern detected, else 3600s (1h)
		const ttl = windowTtlSeconds ?? (/^\d{4}-\d{2}-\d{2}$/.test(windowKey) ? 86400 : 3600);
		const current = await redisIncr(redisKey, ttl);
		if (current !== null) {
			if (current > limit) {
				throw new Error('RATE_LIMIT_EXCEEDED');
			}
			return;
		}
	}

	// Fallback to Firestore atomic transaction rate limiting
	await adminDb.runTransaction(async (transaction) => {
		const doc = await transaction.get(docRef);
		let currentCount = 0;
		if (doc.exists) {
			const data = doc.data();
			if (data?.[windowField] === windowKey) {
				currentCount = data?.[countField] || 0;
			}
		}
		if (currentCount >= limit) {
			throw new Error('RATE_LIMIT_EXCEEDED');
		}
		transaction.set(
			docRef,
			{
				[countField]: currentCount + 1,
				[windowField]: windowKey
			},
			{ merge: true }
		);
	});
}
