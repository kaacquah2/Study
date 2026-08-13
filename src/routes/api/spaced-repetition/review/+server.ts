import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { calculateFSRS } from '$lib/server/fsrs';
import { z } from 'zod';

const ReviewZod = z.object({
	courseId: z.string().optional(),
	moduleId: z.string().optional(),
	questionIndex: z.number().int().optional(),
	cardId: z.string().optional(),
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

		const { courseId, moduleId, questionIndex, cardId, quality } = parsed.data;

		// 1. Handle direct standalone flashcard review if cardId is provided
		if (cardId) {
			const cardRef = adminDb.collection('flashcards').doc(cardId);
			const cardDoc = await cardRef.get();

			if (!cardDoc.exists) {
				return json(
					{ error: { code: 'NOT_FOUND', message: 'Flashcard not found' } },
					{ status: 404 }
				);
			}

			const cardData = cardDoc.data();
			if (cardData?.uid !== user.uid) {
				return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
			}

			const fsrsResult = calculateFSRS({
				quality,
				card: {
					stability: cardData?.stability || 0,
					difficulty: cardData?.difficulty || 5,
					reps: cardData?.reps || cardData?.repetitions || 0,
					lapses: cardData?.lapses || 0,
					state: cardData?.state || 'New',
					lastReview: cardData?.lastReviewedAt || null
				}
			});

			await cardRef.set(
				{
					stability: fsrsResult.card.stability,
					difficulty: fsrsResult.card.difficulty,
					reps: fsrsResult.card.reps,
					lapses: fsrsResult.card.lapses,
					state: fsrsResult.card.state,
					intervalDays: fsrsResult.intervalDays,
					dueDate: fsrsResult.nextReviewDate,
					lastReviewedAt: fsrsResult.card.lastReview,
					updatedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);

			// Log FSRS review event
			try {
				await adminDb.collection('users').doc(user.uid).collection('fsrsReviewLogs').add({
					cardId,
					quality,
					newStability: fsrsResult.card.stability,
					newDifficulty: fsrsResult.card.difficulty,
					timestamp: fsrsResult.card.lastReview
				});
			} catch (logErr) {
				console.warn('Failed to log flashcard review:', logErr);
			}

			return json({ success: true, fsrs: fsrsResult });
		}

		// 2. Handle module quiz question review
		if (!courseId || !moduleId || questionIndex === undefined || questionIndex < 0) {
			return json(
				{
					error: { code: 'INVALID_INPUT', message: 'Missing courseId, moduleId, or questionIndex' }
				},
				{ status: 400 }
			);
		}

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

		// Update question in module
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
