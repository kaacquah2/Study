import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateQuiz, generateLesson } from '$lib/server/ai/provider';
import { z } from 'zod';

const RegenerateItemZod = z.object({
	courseId: z.string(),
	itemType: z.enum(['question', 'page']),
	itemIndex: z.number().int().min(0)
});

// POST /api/modules/[id]/regenerate-item
export const POST: RequestHandler = async ({ params, request }) => {
	const { id: moduleId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = RegenerateItemZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Validation failed' } },
				{ status: 400 }
			);
		}

		const { courseId, itemType, itemIndex } = parsed.data;

		const courseRef = adminDb.collection('courses').doc(courseId);
		const moduleRef = courseRef.collection('modules').doc(moduleId);

		const courseDoc = await courseRef.get();
		if (!courseDoc.exists || courseDoc.data()?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const modDoc = await moduleRef.get();
		if (!modDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Module not found' } }, { status: 404 });
		}

		const modData = modDoc.data();

		if (itemType === 'question' && modData?.type === 'quiz') {
			const currentQuestions = modData.questions || [];
			const targetQ = currentQuestions[itemIndex];

			const quizRes = await generateQuiz(
				courseDoc.data()?.title || 'Course',
				{ title: courseDoc.data()?.title || '', description: '', modules: [] },
				modData.title,
				`Generate 1 new replacement question for topic: ${targetQ?.prompt || modData.title}`,
				modData.keyPoints || [],
				user.uid
			);

			const newQ = quizRes.result.questions[0];
			if (newQ) {
				currentQuestions[itemIndex] = {
					...newQ,
					order: itemIndex + 1
				};
				await moduleRef.set({ questions: currentQuestions }, { merge: true });
				return json({ status: 'updated', question: currentQuestions[itemIndex] });
			}
		} else if (itemType === 'page' && modData?.type === 'lesson') {
			const currentPages = modData.pages || [];
			const targetP = currentPages[itemIndex];

			const lessonRes = await generateLesson(
				courseDoc.data()?.title || 'Course',
				{ title: courseDoc.data()?.title || '', description: '', modules: [] },
				modData.title,
				`Generate 1 new replacement lesson page for section: ${targetP?.heading || modData.title}`,
				modData.keyPoints || [],
				user.uid
			);

			const newP = lessonRes.result.pages[0];
			if (newP) {
				currentPages[itemIndex] = {
					...newP,
					order: itemIndex + 1
				};
				await moduleRef.set({ pages: currentPages }, { merge: true });
				return json({ status: 'updated', page: currentPages[itemIndex] });
			}
		}

		return json(
			{ error: { code: 'INVALID_REQUEST', message: 'Could not regenerate item' } },
			{ status: 400 }
		);
	} catch (err) {
		console.error('Regenerate item error:', err);
		const message = err instanceof Error ? err.message : 'Regeneration failed';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
