import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { handleServerError } from '$lib/server/apiError';

/**
 * POST /api/courses/[id]/fork
 * Clones/Forks a course template into the authenticated user's library.
 * Reuses existing pre-generated module content to save AI generation costs.
 */
export const POST: RequestHandler = async (event) => {
	const { params, request } = event;
	const { id: sourceCourseId } = params;

	try {
		const user = await verifySessionUser(request);

		// 1. Fetch Source Course
		const sourceRef = adminDb.collection('courses').doc(sourceCourseId);
		const sourceDoc = await sourceRef.get();

		if (!sourceDoc.exists) {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Source course not found' } },
				{ status: 404 }
			);
		}

		const sourceData = sourceDoc.data();

		// 2. Fetch Source Modules
		const modulesSnap = await sourceRef.collection('modules').orderBy('order', 'asc').get();
		if (modulesSnap.empty) {
			return json(
				{ error: { code: 'INVALID_COURSE', message: 'Source course has no modules' } },
				{ status: 400 }
			);
		}

		// 3. Create Forked Course Document
		const newCourseRef = adminDb.collection('courses').doc();
		const newCourseId = newCourseRef.id;

		const batch = adminDb.batch();

		batch.set(newCourseRef, {
			id: newCourseId,
			ownerUid: user.uid,
			title: `${sourceData?.title || 'Untitled'} (Forked)`,
			description: sourceData?.description || '',
			topic: sourceData?.topic || '',
			format: sourceData?.format || 'lessons_and_quizzes',
			moduleCount: sourceData?.moduleCount || modulesSnap.docs.length,
			status: 'ready',
			level: sourceData?.level || 'intermediate',
			goal: sourceData?.goal || 'curiosity',
			tags: sourceData?.tags || [],
			estimatedMinutes: sourceData?.estimatedMinutes || 60,
			accent: sourceData?.accent || 'violet',
			progress: { completed: 0, total: modulesSnap.docs.length },
			clonedFrom: sourceCourseId,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});

		// 4. Duplicate Modules
		for (const modDoc of modulesSnap.docs) {
			const modData = modDoc.data();
			const newModRef = newCourseRef.collection('modules').doc();

			batch.set(newModRef, {
				id: newModRef.id,
				courseId: newCourseRef.id,
				ownerUid: user.uid,
				order: modData.order,
				type: modData.type,
				title: modData.title,
				summary: modData.summary,
				learningObjective: modData.learningObjective || '',
				keyPoints: modData.keyPoints || [],
				estimatedMinutes: modData.estimatedMinutes || 12,
				status: modData.status || 'ready',
				pages: modData.pages || null,
				questions: modData.questions || null,
				model: modData.model || 'forked',
				generatedAt: FieldValue.serverTimestamp(),
				tokensIn: 0,
				tokensOut: 0
			});
		}

		await batch.commit();

		return json(
			{ status: 'ok', courseId: newCourseId, message: 'Course successfully forked!' },
			{ status: 201 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event);
	}
};
