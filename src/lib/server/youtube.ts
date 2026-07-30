import { env } from '$env/dynamic/private';
import { adminDb } from './admin';

export interface CachedVideoResult {
	videoId: string;
	title: string;
	channelTitle: string;
	thumbnailUrl: string;
	fetchedAt: number;
}

export const VIDEO_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function getYouTubeApiKey(): string {
	return env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || '';
}

/**
 * Calls YouTube Data API v3 search.list and videos.list to find embeddable videos.
 */
export async function fetchAndFilterVideos(
	query: string,
	apiKeyOverride?: string
): Promise<CachedVideoResult[]> {
	const apiKey = apiKeyOverride ?? getYouTubeApiKey();
	if (!apiKey) {
		console.warn('[youtube.ts] YOUTUBE_API_KEY is not set. Skipping video fetch.');
		return [];
	}

	const now = Date.now();

	// Step 1: search.list (100 units cost)
	const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(
		query
	)}&safeSearch=strict&relevanceLanguage=en&key=${apiKey}`;

	const searchRes = await fetch(searchUrl);
	if (!searchRes.ok) {
		const errText = await searchRes.text();
		console.error(`[youtube.ts] YouTube search.list failed (${searchRes.status}):`, errText);
		throw new Error(`YouTube API search error ${searchRes.status}`);
	}

	const searchData = await searchRes.json();
	const items: Array<{ id?: { videoId?: string } }> = searchData.items || [];
	const candidateIds = items
		.map((item) => item.id?.videoId)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);

	if (candidateIds.length === 0) {
		return [];
	}

	// Step 2: videos.list to check embeddable status (~1 unit cost)
	const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${candidateIds.join(
		','
	)}&key=${apiKey}`;

	const videosRes = await fetch(videosUrl);
	if (!videosRes.ok) {
		const errText = await videosRes.text();
		console.error(`[youtube.ts] YouTube videos.list failed (${videosRes.status}):`, errText);
		throw new Error(`YouTube API videos details error ${videosRes.status}`);
	}

	const videosData = await videosRes.json();
	const videoItems: Array<{
		id: string;
		status?: { embeddable?: boolean };
		snippet?: {
			title?: string;
			channelTitle?: string;
			thumbnails?: {
				medium?: { url?: string };
				default?: { url?: string };
			};
		};
	}> = videosData.items || [];

	const embeddableVideos = videoItems.filter((v) => v.status?.embeddable === true);

	return embeddableVideos.slice(0, 3).map((v) => ({
		videoId: v.id,
		title: v.snippet?.title || 'Educational Video',
		channelTitle: v.snippet?.channelTitle || 'YouTube',
		thumbnailUrl:
			v.snippet?.thumbnails?.medium?.url ||
			v.snippet?.thumbnails?.default?.url ||
			`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
		fetchedAt: now
	}));
}

/**
 * Retrieves supplementary videos for a module, managing Firestore caching and stampede lock.
 */
export async function getModuleVideos(
	courseId: string,
	moduleId: string,
	forceRefresh = false,
	apiKeyOverride?: string
): Promise<CachedVideoResult[]> {
	const moduleRef = adminDb.collection('courses').doc(courseId).collection('modules').doc(moduleId);
	const moduleSnap = await moduleRef.get();

	if (!moduleSnap.exists) {
		throw new Error('Module not found');
	}

	const modData = moduleSnap.data();
	const existingVideos: CachedVideoResult[] | null = modData?.videos ?? null;
	const videosStatus: string | null = modData?.videosStatus ?? null;
	const videosFetchedAt: number | null = modData?.videosFetchedAt ?? null;

	const now = Date.now();

	// 1. Cache hit check (valid TTL and not forcing refresh)
	if (
		!forceRefresh &&
		videosStatus === 'ready' &&
		Array.isArray(existingVideos) &&
		typeof videosFetchedAt === 'number' &&
		now - videosFetchedAt < VIDEO_CACHE_TTL_MS
	) {
		return existingVideos;
	}

	// 2. Thundering-herd lock check
	if (
		!forceRefresh &&
		videosStatus === 'fetching' &&
		typeof videosFetchedAt === 'number' &&
		now - videosFetchedAt < 30_000 // Lock expires in 30s
	) {
		await new Promise((r) => setTimeout(r, 2000));
		const reCheck = await moduleRef.get();
		const reCheckData = reCheck.data();
		if (reCheckData?.videosStatus === 'ready' && Array.isArray(reCheckData.videos)) {
			return reCheckData.videos;
		}
	}

	// 3. Acquire lock
	await moduleRef.set(
		{
			videosStatus: 'fetching',
			videosFetchedAt: now
		},
		{ merge: true }
	);

	// Get course topic to formulate search query
	let query = modData?.title || '';
	try {
		const courseSnap = await adminDb.collection('courses').doc(courseId).get();
		if (courseSnap.exists) {
			const courseTopic = courseSnap.data()?.topic;
			if (courseTopic) {
				query = `${courseTopic} ${modData?.title || ''}`.trim();
			}
		}
	} catch (e) {
		console.warn('[youtube.ts] Could not read course topic for query enrichment:', e);
	}

	try {
		const results = await fetchAndFilterVideos(query, apiKeyOverride);

		// Store cached results in Firestore
		await moduleRef.set(
			{
				videos: results,
				videosStatus: 'ready',
				videosFetchedAt: now
			},
			{ merge: true }
		);

		return results;
	} catch (err) {
		console.error('[youtube.ts] Failed to fetch and cache module videos:', err);

		await moduleRef.set(
			{
				videosStatus: existingVideos ? 'ready' : 'error'
			},
			{ merge: true }
		);

		// Return existing stale/previous cache if available on API error
		return existingVideos || [];
	}
}
