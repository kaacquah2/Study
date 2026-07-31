import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { getModuleVideos } from '$lib/server/youtube';

// GET /api/courses/[id]/modules/[mid]/videos
export const GET: RequestHandler = async ({ params, url, request }) => {
	const { id: courseId, mid: moduleId } = params;

	try {
		// 1. Verify User Session
		const user = await verifySessionUser(request);

		// 2. Verify Course exists and user access
		const courseDoc = await adminDb.collection('courses').doc(courseId).get();
		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		// User must be course owner or course must be shared/public
		if (courseData?.ownerUid !== user.uid && !courseData?.isPublic && !courseData?.shareId) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You do not have access to this course' } },
				{ status: 403 }
			);
		}

		const forceRefresh = url.searchParams.get('refresh') === 'true';

		// 3. Fetch module videos (manages Firestore cache & stampede locks internally)
		const videos = await getModuleVideos(courseId, moduleId, forceRefresh);

		return json({ videos });
	} catch (err) {
		console.error('Fetch module videos API error:', err);
		const message = err instanceof Error ? err.message : '';

		if (message === 'Module not found') {
			return json({ error: { code: 'NOT_FOUND', message: 'Module not found' } }, { status: 404 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}

		// Graceful degradation: return empty videos list on server error rather than breaking page
		return json({ videos: [] });
	}
};

// POST /api/courses/[id]/modules/[mid]/videos (Reroll / Force Refresh)
export const POST: RequestHandler = async ({ params, request }) => {
	const { id: courseId, mid: moduleId } = params;

	try {
		const user = await verifySessionUser(request);

		const courseDoc = await adminDb.collection('courses').doc(courseId).get();
		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'Only course owner can refresh videos' } },
				{ status: 403 }
			);
		}

		const videos = await getModuleVideos(courseId, moduleId, true);
		return json({ videos });
	} catch (err) {
		console.error('Refresh module videos API error:', err);
		return json({ videos: [] });
	}
};
