import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { chat } from '$lib/server/ai/provider';
import { z } from 'zod';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { MLBackendError } from '$lib/server/ai/client';

import { moderateInput } from '$lib/server/ai/moderation';

const ChatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				content: z.string().min(1).max(2_000)
			})
		)
		.min(1)
		.max(8),
	courseId: z.string().optional(),
	moduleId: z.string().optional(),
	courseContext: z.string().max(1_000).optional(),
	socraticMode: z.boolean().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		// Rate limiting: 60 messages per hour
		const hourStr = Math.floor(Date.now() / 3600000).toString();
		const usageRef = adminDb.collection('usage').doc(user.uid);
		try {
			await enforceRateLimit(usageRef, 60, hourStr, 'chatCount', 'chatHour');
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message: 'Rate limit exceeded. You can send up to 60 chat messages per hour.'
						}
					},
					{ status: 429 }
				);
			}
			throw rateErr;
		}

		const body = await request.json();
		const parsed = ChatBodySchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'Validation failed',
						fields: parsed.error.format()
					}
				},
				{ status: 400 }
			);
		}

		const {
			messages,
			courseId,
			moduleId,
			courseContext: rawClientContext,
			socraticMode
		} = parsed.data;

		// Input Safety Moderation Check
		const latestUserMsg = messages[messages.length - 1]?.content || '';
		const modResult = moderateInput(latestUserMsg, undefined, user.uid);
		if (!modResult.safe) {
			return json(
				{
					error: {
						code: 'CONTENT_FLAGGED',
						message: modResult.reason || 'Input content flagged by safety policy.'
					}
				},
				{ status: 400 }
			);
		}

		let contextToUse: string | undefined = undefined;

		if (courseId) {
			const courseDoc = await adminDb.collection('courses').doc(courseId).get();
			if (courseDoc.exists) {
				const courseData = courseDoc.data();
				if (courseData && (courseData.userId === user.uid || courseData.isPublic)) {
					let context = `Active Course: ${courseData.title}\nDescription: ${courseData.description || ''}\n`;
					if (moduleId) {
						const modDoc = await adminDb
							.collection('courses')
							.doc(courseId)
							.collection('modules')
							.doc(moduleId)
							.get();
						if (modDoc.exists) {
							const modData = modDoc.data();
							if (modData) {
								context += `Current Active Module: "${modData.title}" (Type: ${modData.type})\n`;
								if (modData.learningObjective) {
									context += `Learning Objective: ${modData.learningObjective}\n`;
								}
							}
						}
					}
					contextToUse = context.slice(0, 1_000);
				}
			}
		}

		if (!contextToUse && rawClientContext) {
			contextToUse = rawClientContext.slice(0, 1_000);
		}

		if (socraticMode !== false) {
			const socraticInstruction =
				'\n[Pedagogy Instruction: Socratic Mode Active. Act as an encouraging Socratic tutor: 1) Validate the student\'s attempt or intuition. 2) Ask targeted guiding questions to help the student derive answers independently rather than revealing direct answers immediately (e.g., "Give it a try!" or "What container/concept has this property?"). 3) Offer hints or structured comparison points to guide their thinking.]';
			contextToUse = contextToUse ? contextToUse + socraticInstruction : socraticInstruction;
		}

		// Execute chat inference
		const { result: chatResult, provider } = await chat(messages, contextToUse, user.uid);

		// Construct SSE stream using ReadableStream
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				const fullText = chatResult.reply || '';
				const sources = chatResult.sources || [];

				// Stream text in words / chunks for micro-animations
				const words = fullText.split(' ');
				for (let i = 0; i < words.length; i++) {
					const wordChunk = (i === 0 ? '' : ' ') + words[i];
					const eventData = `data: ${JSON.stringify({ type: 'delta', content: wordChunk })}\n\n`;
					controller.enqueue(encoder.encode(eventData));
					// Short delay to simulate real-time token streaming
					await new Promise((resolve) => setTimeout(resolve, 15));
				}

				// Final metadata event
				const finalEvent = `data: ${JSON.stringify({ type: 'done', sources, provider })}\n\n`;
				controller.enqueue(encoder.encode(finalEvent));
				controller.close();
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (err) {
		console.error('Chat SSE API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		if (err instanceof MLBackendError && err.status === 503) {
			return json({ error: { code: 'MODEL_WARMING_UP', message: 'Warming up' } }, { status: 503 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
