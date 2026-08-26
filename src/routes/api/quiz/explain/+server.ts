import type { RequestHandler } from './$types';
/**
 * /api/quiz/explain — "Explain My Mistake" endpoint.
 *
 * Receives question, student answer, correct answer, and lesson context.
 * Generates structured explanation with SSE streaming and AI content moderation.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { generateAICompletion } from '$lib/server/ai/provider';
import { moderateText } from '$lib/server/ai/moderation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		await verifySessionUser(request);

		const body = await request.json();
		const { question, userAnswer, correctAnswer, lessonContext, stream: wantsStream } = body;

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

		const prompt = `A student answered a quiz question incorrectly. Explain clearly and concisely in 2-3 short bullet points why their chosen answer is incorrect and why the correct answer is right.

Question: ${question}
Student's Answer: ${userAnswer}
Correct Answer: ${correctAnswer}
Lesson Context: ${lessonContext || 'N/A'}`;

		const aiResponse = await generateAICompletion({
			prompt,
			systemInstruction: 'You are an encouraging, precise Socratic tutor explaining quiz mistakes clearly.'
		});

		// Enforce AI content moderation guardrail
		const moderationResult = await moderateText(aiResponse.text);
		const finalExplanation = !moderationResult.flagged
			? aiResponse.text
			: 'The selected option is incorrect. The correct option provides the accurate explanation based on the lesson principles.';

		// If client requested SSE streaming or event-stream header
		if (wantsStream || request.headers.get('accept')?.includes('text/event-stream')) {
			const encoder = new TextEncoder();
			const readableStream = new ReadableStream({
				async start(controller) {
					const words = finalExplanation.split(' ');
					for (let i = 0; i < words.length; i++) {
						const chunk = (i === 0 ? '' : ' ') + words[i];
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: chunk })}\n\n`)
						);
						await new Promise((resolve) => setTimeout(resolve, 16));
					}
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ type: 'done', provider: aiResponse.provider })}\n\n`
						)
					);
					controller.close();
				}
			});

			return new Response(readableStream, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache, no-transform',
					Connection: 'keep-alive',
					'X-Accel-Buffering': 'no'
				}
			});
		}

		return json({
			explanation: finalExplanation,
			servicedByProvider: aiResponse.provider
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
