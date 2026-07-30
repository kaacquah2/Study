import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';

const SaveQuizStateZod = z.object({
	courseId: z.string(),
	currentQuestionIndex: z.number().int().min(0),
	score: z.number().int().min(0),
	selectedAnswers: z.record(z.string(), z.number()).optional()
});

// GET /api/modules/[id]/quiz-state?courseId=xxx
export async function GET({ params, request, url }) {
	const { id: moduleId } = params;
	const courseId = url.searchParams.get('courseId');

	if (!courseId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'Missing courseId parameter' } },
			{ status: 400 }
		);
	}

	try {
		const user = await verifySessionUser(request);
		const quizStateRef = adminDb
			.collection('users')
			.doc(user.uid)
			.collection('progress')
			.doc(courseId)
			.collection('quizStates')
			.doc(moduleId);

		const docSnap = await quizStateRef.get();
		if (!docSnap.exists) {
			return json({ state: null });
		}

		return json({ state: docSnap.data() });
	} catch (err) {
		console.error('Get quiz state API error:', err);
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

// POST /api/modules/[id]/quiz-state
export async function POST({ params, request }) {
	const { id: moduleId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = SaveQuizStateZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Validation failed' } },
				{ status: 400 }
			);
		}

		const { courseId, currentQuestionIndex, score, selectedAnswers } = parsed.data;

		const quizStateRef = adminDb
			.collection('users')
			.doc(user.uid)
			.collection('progress')
			.doc(courseId)
			.collection('quizStates')
			.doc(moduleId);

		await quizStateRef.set(
			{
				currentQuestionIndex,
				score,
				selectedAnswers: selectedAnswers || {},
				updatedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);

		return json({ success: true });
	} catch (err) {
		console.error('Save quiz state API error:', err);
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
