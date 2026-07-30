import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export async function GET({ params, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You do not own this course' } },
				{ status: 403 }
			);
		}

		const completed = courseData?.progress?.completed || 0;
		const total = courseData?.moduleCount || 1;

		if (completed < total) {
			return json(
				{ error: { code: 'INCOMPLETE', message: 'Course is not yet 100% completed' } },
				{ status: 400 }
			);
		}

		const certificate = {
			id: `CERT-${courseId.slice(0, 8).toUpperCase()}`,
			courseId,
			courseTitle: courseData.title,
			studentName: user.email || 'Learner',
			issuedAt: new Date().toISOString(),
			shareUrl: `${new URL(request.url).origin}/shared/${courseId}`
		};

		return json({ certificate });
	} catch (err) {
		console.error('Certificate API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
}
