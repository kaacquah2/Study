import { isRedisConfigured, redisGet, redisSet } from './redis';

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
 * Invalidate cached course outline in local memory and Redis when modified.
 */
export function invalidateCachedOutline(courseId: string): void {
	memoryCache.delete(courseId);
}
