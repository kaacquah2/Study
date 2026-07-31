import type { RequestHandler } from './$types';
/**
 * /api/quiz/explain — "Explain My Mistake" endpoint.
 *
 * Receives question, student answer, correct answer, and lesson context.
 * Generates structured explanation and passes output through moderation.ts.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { generateAICompletion } from '$lib/server/ai/provider';
import { moderateText } from '$lib/server/ai/moderation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		await verifySessionUser(request);

		const body = await request.json();
		const { question, userAnswer, correctAnswer, lessonContext } = body;

		if (!question || userAnswer === undefined || correctAnswer === undefined) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'question, userAnswer, and correctAnswer are required.'
					}
				},
				{ status: 400 }
			);
		}

		const prompt = `A student answered a quiz question incorrectly. Explain clearly and concisely why their chosen answer is incorrect and why the correct answer is right.

Question: ${question}
Student's Answer: ${userAnswer}
Correct Answer: ${correctAnswer}
Lesson Context: ${lessonContext || 'N/A'}`;

		const aiResponse = await generateAICompletion({
			prompt,
			systemInstruction: 'You are an encouraging, precise tutor explaining quiz mistakes.'
		});

		// Enforce AI content moderation guardrail
		const moderationResult = await moderateText(aiResponse.text);
		if (!moderationResult.flagged) {
			// Clean text if unflagged
			return json({
				explanation: aiResponse.text,
				servicedByProvider: aiResponse.provider
			});
		}

		return json({
			explanation:
				'The student answer is incorrect. The correct answer provides the accurate factual explanation based on the lesson material.',
			servicedByProvider: aiResponse.provider,
			moderated: true
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
