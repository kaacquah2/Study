import { isRedisConfigured, redisGet, redisSet, redisDel } from './redis';

// Short-lived in-memory cache to deduplicate concurrent course outline queries locally
const memoryCache = new Map<string, Promise<unknown>>();

/**
 * Get or fetch the course outline from distributed Redis or local cache.
 * Returns the identical Promise to deduplicate in-flight requests.
 */
export function getCachedOutline<T>(courseId: string, fetchFn: () => Promise<T>): Promise<T> {
	const redisKey = `cache:outline:${courseId}`;

	let cached = memoryCache.get(courseId);
	if (!cached) {
		cached = (async () => {
			if (isRedisConfigured()) {
				const redisData = await redisGet<T>(redisKey);
				if (redisData) {
					return redisData;
				}
			}
			const data = await fetchFn();
			if (isRedisConfigured() && data) {
				redisSet(redisKey, data, 60).catch(() => {});
			}
			return data;
		})();

		memoryCache.set(courseId, cached);
		setTimeout(() => memoryCache.delete(courseId), 30_000);
	}

	return cached as Promise<T>;
}

/**
 * Executes an expensive async operation with distributed Singleflight mutex locking.
 * Prevents multiple identical concurrent operations from executing simultaneously.
 * Includes a 45-second lock TTL and 40-second polling timeout with fallback to prevent hangs on worker crash.
 */
export async function runWithSingleflight<T>(
	key: string,
	executeFn: () => Promise<T>,
	ttlSeconds = 86400,
	lockTimeoutMs = 45000
): Promise<T> {
	const cacheKey = `singleflight:cache:${key}`;
	const lockKey = `singleflight:lock:${key}`;

	// 1. Check existing distributed cache
	if (isRedisConfigured()) {
		const cached = await redisGet<T>(cacheKey);
		if (cached !== null) {
			return cached;
		}

		// Try to acquire distributed lock
		const workerId = Math.random().toString(36).slice(2);
		const acquired = await redisSet(lockKey, workerId, Math.ceil(lockTimeoutMs / 1000));

		if (!acquired) {
			// Lock held by another worker; poll for completion up to lockTimeoutMs
			const startTime = Date.now();
			while (Date.now() - startTime < lockTimeoutMs) {
				await new Promise((resolve) => setTimeout(resolve, 600));
				const pollCached = await redisGet<T>(cacheKey);
				if (pollCached !== null) {
					return pollCached;
				}
			}
			// Polling timed out (holding worker may have crashed): proceed with direct execution
		}
	}

	// 2. Execute the underlying operation
	try {
		const result = await executeFn();
		if (isRedisConfigured() && result !== null && result !== undefined) {
			await redisSet(cacheKey, result, ttlSeconds);
		}
		return result;
	} finally {
		if (isRedisConfigured()) {
			await redisDel(lockKey).catch(() => {});
		}
	}
}

/**
 * Invalidate cached course outline in local memory and Redis when modified.
 */
export function invalidateCachedOutline(courseId: string): void {
	memoryCache.delete(courseId);
	if (isRedisConfigured()) {
		redisDel(`cache:outline:${courseId}`).catch(() => {});
		redisDel(`singleflight:cache:outline:${courseId}`).catch(() => {});
	}
}
