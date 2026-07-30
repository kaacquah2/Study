import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAndFilterVideos, getModuleVideos, VIDEO_CACHE_TTL_MS } from './youtube';
import { adminDb } from './admin';

vi.mock('./admin', () => {
	const mockGet = vi.fn();
	const mockSet = vi.fn().mockResolvedValue(undefined);
	const mockDoc = vi.fn().mockReturnValue({
		get: mockGet,
		set: mockSet
	});
	const mockCollection = vi.fn().mockReturnValue({
		doc: mockDoc
	});

	return {
		adminDb: {
			collection: mockCollection
		}
	};
});

describe('YouTube Video Integration Unit Tests', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	describe('fetchAndFilterVideos', () => {
		it('returns empty array when API key is missing', async () => {
			const results = await fetchAndFilterVideos('calculus', '');
			expect(results).toEqual([]);
		});

		it('fetches candidate videos and filters only embeddable ones', async () => {
			const mockFetch = vi
				.fn()
				// search.list response
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						items: [
							{ id: { videoId: 'vid1' } },
							{ id: { videoId: 'vid2' } },
							{ id: { videoId: 'vid3' } }
						]
					})
				})
				// videos.list response
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						items: [
							{
								id: 'vid1',
								status: { embeddable: true },
								snippet: { title: 'Calculus Basics', channelTitle: 'Math Academy' }
							},
							{
								id: 'vid2',
								status: { embeddable: false },
								snippet: { title: 'Non-embeddable Video', channelTitle: 'Private Channel' }
							},
							{
								id: 'vid3',
								status: { embeddable: true },
								snippet: { title: 'Derivatives Explained', channelTitle: 'Khan Math' }
							}
						]
					})
				});

			global.fetch = mockFetch;

			const results = await fetchAndFilterVideos('calculus', 'fake-key');

			expect(results).toHaveLength(2);
			expect(results[0].videoId).toBe('vid1');
			expect(results[0].title).toBe('Calculus Basics');
			expect(results[1].videoId).toBe('vid3');
			expect(results[1].title).toBe('Derivatives Explained');
		});

		it('returns empty array when search.list yields zero results', async () => {
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ items: [] })
			});

			const results = await fetchAndFilterVideos('nonexistent-topic-xyz', 'fake-key');
			expect(results).toEqual([]);
		});

		it('throws on YouTube API error or 403 quota exceeded', async () => {
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: async () => 'quotaExceeded'
			});

			await expect(fetchAndFilterVideos('calculus', 'fake-key')).rejects.toThrow(
				'YouTube API search error 403'
			);
		});
	});

	describe('getModuleVideos (Firestore caching & locking)', () => {
		it('returns cached videos on cache hit within TTL without calling fetch', async () => {
			const mockModuleDoc = {
				exists: true,
				data: () => ({
					videosStatus: 'ready',
					videosFetchedAt: Date.now() - 1000, // 1 second ago
					videos: [
						{
							videoId: 'cached1',
							title: 'Cached Video 1',
							channelTitle: 'Ch1',
							thumbnailUrl: 't1',
							fetchedAt: Date.now() - 1000
						}
					]
				})
			};

			const mockModuleRef = {
				get: vi.fn().mockResolvedValue(mockModuleDoc),
				set: vi.fn()
			};

			vi.mocked(adminDb.collection).mockReturnValue({
				doc: vi.fn().mockReturnValue({
					collection: vi.fn().mockReturnValue({
						doc: vi.fn().mockReturnValue(mockModuleRef)
					})
				})
			} as unknown as ReturnType<typeof adminDb.collection>);

			global.fetch = vi.fn(); // Should NOT be called

			const results = await getModuleVideos('course1', 'mod1');

			expect(results).toHaveLength(1);
			expect(results[0].videoId).toBe('cached1');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('re-fetches when cached videos have expired TTL', async () => {
			const expiredTime = Date.now() - (VIDEO_CACHE_TTL_MS + 1000);
			const mockModuleDoc = {
				exists: true,
				data: () => ({
					videosStatus: 'ready',
					videosFetchedAt: expiredTime,
					videos: [{ videoId: 'old1' }],
					title: 'Integration'
				})
			};

			const mockCourseDoc = {
				exists: true,
				data: () => ({ topic: 'Calculus' })
			};

			const mockModuleRef = {
				get: vi.fn().mockResolvedValue(mockModuleDoc),
				set: vi.fn().mockResolvedValue(undefined)
			};

			const mockCourseRef = {
				get: vi.fn().mockResolvedValue(mockCourseDoc)
			};

			vi.mocked(adminDb.collection).mockImplementation((collName: string) => {
				if (collName === 'courses') {
					return {
						doc: vi.fn().mockImplementation((id: string) => {
							if (id === 'course1') {
								return {
									...mockCourseRef,
									collection: vi.fn().mockReturnValue({
										doc: vi.fn().mockReturnValue(mockModuleRef)
									})
								};
							}
							return mockCourseRef;
						})
					} as unknown as ReturnType<typeof adminDb.collection>;
				}
				return {} as unknown as ReturnType<typeof adminDb.collection>;
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ items: [{ id: { videoId: 'new1' } }] })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						items: [{ id: 'new1', status: { embeddable: true }, snippet: { title: 'New Video' } }]
					})
				});

			const results = await getModuleVideos('course1', 'mod1', false, 'fake-key');

			expect(results).toHaveLength(1);
			expect(results[0].videoId).toBe('new1');
		});

		it('handles concurrent stampede locking gracefully by waiting and re-checking', async () => {
			const mockFetchingDoc = {
				exists: true,
				data: () => ({
					videosStatus: 'fetching',
					videosFetchedAt: Date.now() - 1000
				})
			};

			const mockReadyDoc = {
				exists: true,
				data: () => ({
					videosStatus: 'ready',
					videosFetchedAt: Date.now(),
					videos: [{ videoId: 'concurrent1', title: 'Concurrent Result' }]
				})
			};

			const mockModuleRef = {
				get: vi
					.fn()
					.mockResolvedValueOnce(mockFetchingDoc) // first check sees fetching
					.mockResolvedValueOnce(mockReadyDoc), // second check after delay sees ready
				set: vi.fn()
			};

			vi.mocked(adminDb.collection).mockReturnValue({
				doc: vi.fn().mockReturnValue({
					collection: vi.fn().mockReturnValue({
						doc: vi.fn().mockReturnValue(mockModuleRef)
					})
				})
			} as unknown as ReturnType<typeof adminDb.collection>);

			global.fetch = vi.fn(); // Should NOT be called by the second concurrent caller

			const results = await getModuleVideos('course1', 'mod1');

			expect(results).toHaveLength(1);
			expect(results[0].videoId).toBe('concurrent1');
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('returns previous cached videos gracefully when YouTube API fails', async () => {
			const mockModuleDoc = {
				exists: true,
				data: () => ({
					videosStatus: 'error',
					videosFetchedAt: null,
					videos: [{ videoId: 'previous1', title: 'Previous Cache' }],
					title: 'Limits'
				})
			};

			const mockModuleRef = {
				get: vi.fn().mockResolvedValue(mockModuleDoc),
				set: vi.fn().mockResolvedValue(undefined)
			};

			vi.mocked(adminDb.collection).mockReturnValue({
				doc: vi.fn().mockReturnValue({
					collection: vi.fn().mockReturnValue({
						doc: vi.fn().mockReturnValue(mockModuleRef)
					})
				})
			} as unknown as ReturnType<typeof adminDb.collection>);

			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => 'Internal Server Error'
			});

			const results = await getModuleVideos('course1', 'mod1', false, 'fake-key');

			expect(results).toHaveLength(1);
			expect(results[0].videoId).toBe('previous1');
		});
	});
});
