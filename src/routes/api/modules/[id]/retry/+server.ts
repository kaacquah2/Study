import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';

const RetryModuleZod = z.object({
	courseId: z.string()
});

// POST /api/modules/[id]/retry
export async function POST({ params, request }) {
	const { id: moduleId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = RetryModuleZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Missing courseId' } },
				{ status: 400 }
			);
		}

		const { courseId } = parsed.data;

		// Check ownership of the course
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

		const moduleRef = courseRef.collection('modules').doc(moduleId);

		// Reset status to pending, clear errors, and reset attempts counter
		await moduleRef.update({
			status: 'pending',
			error: null,
			attempts: 0
		});

		// Update course status to building if it was partial or failed
		if (courseData.status === 'partial' || courseData.status === 'failed') {
			await courseRef.update({
				status: 'building'
			});
		}

		// Trigger background module generation immediately
		const authHeader = request.headers.get('Authorization');
		const internalKey = process.env.ML_BACKEND_API_KEY || '';
		const origin = new URL(request.url).origin;

		(async () => {
			try {
				const headers: Record<string, string> = {
					'Content-Type': 'application/json'
				};
				if (authHeader) headers['Authorization'] = authHeader;
				if (internalKey) {
					headers['X-Internal-Service-Key'] = internalKey;
					headers['X-Internal-User-UID'] = user.uid;
				}

				await fetch(`${origin}/api/modules/${moduleId}/generate`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ courseId })
				});
			} catch (e) {
				console.error(`[Retry Handler] Module ${moduleId} generation trigger error:`, e);
			}
		})().catch((err) => console.error('[Retry Handler] Async error:', err));

		return json({ status: 'pending', message: 'Module retry dispatched' }, { status: 202 });
	} catch (err) {
		console.error('Retry module API error:', err);
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
