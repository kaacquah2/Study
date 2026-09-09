import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	isRedisConfigured,
	redisGet,
	redisSet,
	redisPipeline,
	redisIncr,
	redisDel,
	redisPublish,
	redisPing
} from './redis';

vi.mock('$env/dynamic/private', () => ({
	env: {
		UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
		UPSTASH_REDIS_REST_TOKEN: 'mock-token'
	}
}));

describe('redis server helper tests', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('reports isRedisConfigured as true when environment variables are set', () => {
		expect(isRedisConfigured()).toBe(true);
	});

	it('redisPing returns true on successful PONG response', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: 'PONG' })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisPing();
		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test-redis.upstash.io',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer mock-token'
				}),
				body: JSON.stringify(['PING'])
			})
		);
	});

	it('redisGet parses JSON when available', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: JSON.stringify({ count: 42 }) })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisGet<{ count: number }>('test-key');
		expect(result).toEqual({ count: 42 });
	});

	it('redisSet executes SET command with TTL correctly', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: 'OK' })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisSet('test-key', { sample: true }, 60);
		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test-redis.upstash.io',
			expect.objectContaining({
				body: JSON.stringify(['SET', 'test-key', JSON.stringify({ sample: true }), 'EX', '60'])
			})
		);
	});

	it('redisPipeline sends batched commands to pipeline endpoint', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ result: 1 }, { result: 1 }]
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisPipeline([
			['INCR', 'counter'],
			['EXPIRE', 'counter', '60']
		]);
		expect(result).toEqual([1, 1]);
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test-redis.upstash.io/pipeline',
			expect.objectContaining({
				method: 'POST'
			})
		);
	});

	it('redisIncr increments key without TTL', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: 5 })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisIncr('counter');
		expect(result).toBe(5);
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test-redis.upstash.io',
			expect.objectContaining({
				body: JSON.stringify(['INCR', 'counter'])
			})
		);
	});

	it('redisIncr increments key with TTL using pipeline', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ result: 1 }, { result: 1 }]
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisIncr('counter', 60);
		expect(result).toBe(1);
		expect(mockFetch).toHaveBeenCalledWith(
			'https://test-redis.upstash.io/pipeline',
			expect.objectContaining({
				body: JSON.stringify([
					['INCR', 'counter'],
					['EXPIRE', 'counter', '60']
				])
			})
		);
	});

	it('redisDel returns true when key is deleted', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: 1 })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisDel('test-key');
		expect(result).toBe(true);
	});

	it('redisPublish issues PUBLISH command', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ result: 1 })
		});
		vi.stubGlobal('fetch', mockFetch);

		const result = await redisPublish('channel', 'event-payload');
		expect(result).toBe(1);
	});
});
