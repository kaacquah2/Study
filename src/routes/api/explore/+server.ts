import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export interface ExploreCoursePreview {
	id: string;
	title: string;
	description: string;
	sharedByName: string;
	moduleCount: number;
	claimCount: number;
	importCount: number;
	isOfficial: boolean;
	level: 'beginner' | 'intermediate' | 'advanced';
	tags: string[];
	createdAt?: string | null;
}

// GET /api/explore
// Returns paginated preview cards for community-published courses (never full snapshots or private shares)
export const GET: RequestHandler = async ({ url, request }) => {
	try {
		await verifySessionUser(request);

		const limitParam = parseInt(url.searchParams.get('limit') || '18', 10);
		const limit = Math.min(Math.max(1, isNaN(limitParam) ? 18 : limitParam), 50);
		const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();
		const tagFilter = (url.searchParams.get('tag') || 'All').trim();
		const sortBy = (url.searchParams.get('sort') || 'popular') as 'popular' | 'beginner' | 'newest';
		const cursor = url.searchParams.get('cursor') || null;

		// Query only explicitly public and active shared courses
		const baseQuery = adminDb
			.collection('sharedCourses')
			.where('isPublic', '==', true)
			.where('revoked', '==', false);

		const snapshot = await baseQuery.get();

		let courses: ExploreCoursePreview[] = [];
		const allTagsSet = new Set<string>();

		snapshot.forEach((doc) => {
			const data = doc.data();
			const snap = data.snapshot || {};
			const docTags: string[] = Array.isArray(data.tags) ? data.tags : [];

			docTags.forEach((t) => {
				const trimmed = t?.trim();
				if (trimmed) allTagsSet.add(trimmed);
			});

			const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null;

			courses.push({
				id: doc.id,
				title: snap.title || 'Untitled Course',
				description: snap.description || '',
				sharedByName: data.sharedByName || 'Community Member',
				moduleCount: Array.isArray(snap.modules) ? snap.modules.length : data.moduleCount || 0,
				claimCount: data.claimCount || 0,
				importCount: data.importCount || data.claimCount || 0,
				isOfficial: Boolean(data.isOfficial),
				level: data.level || 'intermediate',
				tags: docTags,
				createdAt
			});
		});

		// 1. Tag Filtering
		if (tagFilter && tagFilter.toLowerCase() !== 'all') {
			const filterLower = tagFilter.toLowerCase();
			courses = courses.filter((c) => c.tags.some((t) => t.toLowerCase() === filterLower));
		}

		// 2. Search Query Filtering
		if (searchQuery) {
			courses = courses.filter(
				(c) =>
					c.title.toLowerCase().includes(searchQuery) ||
					c.description.toLowerCase().includes(searchQuery) ||
					c.sharedByName.toLowerCase().includes(searchQuery) ||
					c.tags.some((t) => t.toLowerCase().includes(searchQuery))
			);
		}

		// 3. Sorting
		courses.sort((a, b) => {
			// Official courses always pinned to top
			if (a.isOfficial && !b.isOfficial) return -1;
			if (!a.isOfficial && b.isOfficial) return 1;

			if (sortBy === 'beginner') {
				if (a.level === 'beginner' && b.level !== 'beginner') return -1;
				if (a.level !== 'beginner' && b.level === 'beginner') return 1;
			}

			if (sortBy === 'newest' && a.createdAt && b.createdAt) {
				return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
			}

			const impA = a.importCount || a.claimCount || 0;
			const impB = b.importCount || b.claimCount || 0;
			return impB - impA;
		});

		const total = courses.length;

		// 4. Cursor / Pagination
		let startIndex = 0;
		if (cursor) {
			const foundIndex = courses.findIndex((c) => c.id === cursor);
			if (foundIndex !== -1) {
				startIndex = foundIndex + 1;
			}
		}

		const paginatedCourses = courses.slice(startIndex, startIndex + limit);
		const nextCursor =
			startIndex + limit < courses.length
				? paginatedCourses[paginatedCourses.length - 1]?.id || null
				: null;

		return json({
			courses: paginatedCourses,
			total,
			hasMore: nextCursor !== null,
			nextCursor,
			availableTags: ['All', ...Array.from(allTagsSet)]
		});
	} catch (err) {
		console.error('Explore API error:', err);
		const message = err instanceof Error ? err.message : 'Internal Server Error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
