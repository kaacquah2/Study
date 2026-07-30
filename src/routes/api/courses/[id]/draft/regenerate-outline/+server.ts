import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';
import { z } from 'zod';

const SteeringRegenerateZod = z.object({
	steeringHint: z.string().max(300).optional()
});

// POST /api/courses/[id]/draft/regenerate-outline
export async function POST({ params, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json().catch(() => ({}));
		const parsed = SteeringRegenerateZod.safeParse(body);

		const steeringHint = parsed.success ? parsed.data.steeringHint : '';

		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		let topicPrompt = courseData?.topic || 'General Subject';
		if (steeringHint && steeringHint.trim()) {
			topicPrompt += ` (Custom Direction / Steering: ${steeringHint.trim()})`;
		}

		const res = await generateOutline(
			topicPrompt,
			courseData?.moduleCount || 4,
			courseData?.format || 'lessons_and_quizzes',
			courseData?.referenceText || undefined
		);

		return json({
			status: 'success',
			outline: res.result,
			provider: res.provider
		});
	} catch (err) {
		console.error('Steering regenerate outline API error:', err);
		const message = err instanceof Error ? err.message : 'Failed to regenerate outline';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
