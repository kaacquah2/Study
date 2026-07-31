/**
 * Upstash / Redis REST API helper utility for serverless distributed caching & rate limiting.
 * Smoothly falls back to in-memory/Firestore operations when environment variables are not provided.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || '';

export function isRedisConfigured(): boolean {
	return Boolean(REDIS_URL && REDIS_TOKEN);
}

/**
 * Execute command via Upstash Redis REST API
 */
async function redisCommand<T = unknown>(command: string[]): Promise<T | null> {
	if (!isRedisConfigured()) return null;

	try {
		const res = await fetch(REDIS_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${REDIS_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(command)
		});

		if (!res.ok) {
			console.warn(`Redis command failed: ${res.statusText}`);
			return null;
		}

		const data = await res.json();
		return data.result ?? null;
	} catch (err) {
		console.warn('Redis connection error:', err);
		return null;
	}
}

export async function redisGet<T = unknown>(key: string): Promise<T | null> {
	const result = await redisCommand<string>(['GET', key]);
	if (!result) return null;
	try {
		return JSON.parse(result) as T;
	} catch {
		return result as unknown as T;
	}
}

export async function redisSet(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
	const strValue = typeof value === 'string' ? value : JSON.stringify(value);
	const cmd = ttlSeconds
		? ['SET', key, strValue, 'EX', ttlSeconds.toString()]
		: ['SET', key, strValue];
	const res = await redisCommand(cmd);
	return res === 'OK';
}

/**
 * Execute multiple pipeline commands via Upstash Redis REST /pipeline API in a single HTTP request.
 */
export async function redisPipeline<T = unknown[]>(commands: string[][]): Promise<T | null> {
	if (!isRedisConfigured()) return null;

	try {
		const pipelineUrl = REDIS_URL.endsWith('/pipeline')
			? REDIS_URL
			: `${REDIS_URL.replace(/\/$/, '')}/pipeline`;

		const res = await fetch(pipelineUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${REDIS_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(commands)
		});

		if (!res.ok) {
			console.warn(`Redis pipeline command failed: ${res.statusText}`);
			return null;
		}

		const data = await res.json();
		return (Array.isArray(data)
			? data.map((item: { result?: unknown }) => item.result)
			: null) as unknown as T;
	} catch (err) {
		console.warn('Redis pipeline connection error:', err);
		return null;
	}
}

export async function redisIncr(key: string, ttlSeconds?: number): Promise<number | null> {
	if (ttlSeconds) {
		const results = await redisPipeline<[number, number]>([
			['INCR', key],
			['EXPIRE', key, ttlSeconds.toString()]
		]);
		return results ? results[0] : null;
	}

	return await redisCommand<number>(['INCR', key]);
}
