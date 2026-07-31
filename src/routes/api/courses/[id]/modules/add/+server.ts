import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';

const AddModuleZod = z.object({
	title: z.string().min(2).max(120).optional(),
	summary: z.string().max(500).optional(),
	type: z.enum(['lesson', 'quiz']).optional()
});

// POST /api/courses/[id]/modules/add
export const POST: RequestHandler = async ({ params, request }) => {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json().catch(() => ({}));
		const parsed = AddModuleZod.safeParse(body);

		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const modulesSnap = await courseRef.collection('modules').get();
		const currentCount = modulesSnap.size;

		const type =
			parsed.success && parsed.data.type
				? parsed.data.type
				: currentCount % 2 === 0
					? 'lesson'
					: 'quiz';
		const title =
			parsed.success && parsed.data.title
				? parsed.data.title
				: `Module ${currentCount + 1}: Deep Dive`;
		const summary =
			parsed.success && parsed.data.summary
				? parsed.data.summary
				: `Advanced concepts and key practical takeaways for ${courseData?.topic || 'this subject'}.`;

		const newModuleRef = courseRef.collection('modules').doc();
		const newModuleId = newModuleRef.id;

		await adminDb.runTransaction(async (transaction) => {
			transaction.set(newModuleRef, {
				id: newModuleId,
				order: currentCount + 1,
				type,
				title,
				summary,
				learningObjective: summary,
				keyPoints: [title],
				estimatedMinutes: 12,
				status: 'pending',
				attempts: 0,
				error: null,
				pages: null,
				questions: null,
				model: 'flan-t5-large',
				generatedAt: null
			});

			transaction.update(courseRef, {
				moduleCount: currentCount + 1,
				'progress.total': currentCount + 1,
				updatedAt: FieldValue.serverTimestamp()
			});
		});

		return json(
			{ moduleId: newModuleId, courseId, message: 'Module slot added successfully' },
			{ status: 201 }
		);
	} catch (err) {
		console.error('Add module API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to add module' } },
			{ status: 500 }
		);
	}
};
