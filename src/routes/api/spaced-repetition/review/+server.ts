import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { calculateFSRS } from '$lib/server/fsrs';
import { z } from 'zod';

const ReviewZod = z.object({
	courseId: z.string(),
	moduleId: z.string(),
	questionIndex: z.number().int().min(0),
	quality: z.number().int().min(0).max(5)
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = ReviewZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Invalid payload parameters' } },
				{ status: 400 }
			);
		}

		const { courseId, moduleId, questionIndex, quality } = parsed.data;

		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const moduleRef = courseRef.collection('modules').doc(moduleId);
		const moduleDoc = await moduleRef.get();

		if (!moduleDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Module not found' } }, { status: 404 });
		}

		const moduleData = moduleDoc.data();
		if (!Array.isArray(moduleData?.questions) || questionIndex >= moduleData.questions.length) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Invalid question index' } },
				{ status: 400 }
			);
		}

		const currentQuestion = moduleData.questions[questionIndex];
		const fsrsResult = calculateFSRS({
			quality,
			card: {
				stability: currentQuestion.stability || 0,
				difficulty: currentQuestion.difficulty || 5,
				reps: currentQuestion.repetitions || currentQuestion.reps || 0,
				lapses: currentQuestion.lapses || 0,
				state: currentQuestion.fsrsState || 'New',
				lastReview: currentQuestion.lastReviewedAt || null
			}
		});

		// Update the question's FSRS metadata in the module's questions array
		const updatedQuestions = [...moduleData.questions];
		updatedQuestions[questionIndex] = {
			...currentQuestion,
			stability: fsrsResult.card.stability,
			difficulty: fsrsResult.card.difficulty,
			repetitions: fsrsResult.card.reps,
			lapses: fsrsResult.card.lapses,
			fsrsState: fsrsResult.card.state,
			intervalDays: fsrsResult.intervalDays,
			nextReviewDate: fsrsResult.nextReviewDate,
			lastReviewedAt: fsrsResult.card.lastReview
		};

		await moduleRef.set(
			{
				questions: updatedQuestions,
				updatedAt: FieldValue.serverTimestamp()
			},
			{ merge: true }
		);

		// Record immutable review log for user memory retention analytics
		try {
			const lastReviewDate = currentQuestion.lastReviewedAt
				? new Date(currentQuestion.lastReviewedAt)
				: new Date();
			const elapsedDays = Math.max(
				0,
				(Date.now() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24)
			);
			const predictedRetrievability = Math.pow(
				1 + elapsedDays / (9 * (currentQuestion.stability || 1)),
				-1
			);

			await adminDb
				.collection('users')
				.doc(user.uid)
				.collection('fsrsReviewLogs')
				.add({
					courseId,
					moduleId,
					questionIndex,
					quality,
					elapsedDays: Number(elapsedDays.toFixed(2)),
					predictedRetrievability: Number(predictedRetrievability.toFixed(4)),
					newStability: fsrsResult.card.stability,
					newDifficulty: fsrsResult.card.difficulty,
					timestamp: fsrsResult.card.lastReview
				});
		} catch (logErr) {
			console.warn('Failed to record FSRS review log to Firestore:', logErr);
		}

		return json({
			success: true,
			fsrs: fsrsResult
		});
	} catch (err) {
		console.error('Spaced Repetition Review API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
