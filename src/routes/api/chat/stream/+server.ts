import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { chat, streamChat } from '$lib/server/ai/provider';
import { z } from 'zod';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { MLBackendError } from '$lib/server/ai/client';
import { handleServerError } from '$lib/server/apiError';

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
	socraticMode: z.boolean().optional(),
	sessionEvents: z
		.array(
			z.object({
				type: z.string(),
				snippet: z.string().optional(),
				summary: z.string().optional(),
				conceptId: z.string().optional(),
				timestamp: z.number()
			})
		)
		.optional()
});

function sanitizeContextText(text: string): string {
	if (!text) return '';
	return text
		.replace(/<[^>]*>/g, '')
		.replace(/[\r\n]{3,}/g, '\n\n')
		.trim()
		.slice(0, 1_000);
}

export const POST: RequestHandler = async (event) => {
	const { request } = event;
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
			console.warn('[chat/stream POST] Validation failed:', parsed.error.issues);
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'Validation failed'
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
			socraticMode,
			sessionEvents
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
			contextToUse = sanitizeContextText(rawClientContext);
		}

		// Inject recent student actions/events from studySessionStore
		if (sessionEvents && sessionEvents.length > 0) {
			const recentFormatted = sessionEvents
				.slice(0, 6)
				.map((e) => {
					const label =
						e.type === 'lens_explain'
							? 'Requested Explanation'
							: e.type === 'lens_example'
								? 'Requested Real-World Example'
								: e.type === 'lens_quiz'
									? 'Took Instant Quiz'
									: e.type === 'flashcard_created'
										? 'Created Flashcard'
										: e.type === 'tts_read'
											? 'Listened to Audio'
											: e.type === 'quiz_answered'
												? 'Answered Quiz Question'
												: e.type;
					const snippetPart = e.snippet ? ` on text: "${e.snippet.slice(0, 120)}..."` : '';
					const summaryPart = e.summary ? ` (${e.summary})` : '';
					return `- ${label}${snippetPart}${summaryPart}`;
				})
				.join('\n');
			const eventsBlock = `\n[Recent Student Actions in Current Lesson Session]:\n${recentFormatted}\n`;
			contextToUse = contextToUse ? contextToUse + eventsBlock : eventsBlock;
		}

		if (socraticMode !== false) {
			const socraticInstruction =
				'\n[Pedagogy Instruction: Socratic Mode Active. Act as an encouraging Socratic tutor: 1) Validate the student\'s attempt or intuition. 2) Ask targeted guiding questions to help the student derive answers independently rather than revealing direct answers immediately (e.g., "Give it a try!" or "What container/concept has this property?"). 3) Offer hints or structured comparison points to guide their thinking.]';
			contextToUse = contextToUse ? contextToUse + socraticInstruction : socraticInstruction;
		}

		// Prepare live token stream generator
		const generator = (async function* () {
			if (typeof streamChat === 'function') {
				const streamResult = streamChat(messages, contextToUse, user.uid);
				if (streamResult && typeof streamResult[Symbol.asyncIterator] === 'function') {
					for await (const chunk of streamResult) {
						yield chunk;
					}
					return;
				}
			}
			const res = await chat(messages, contextToUse, user.uid);
			yield { token: res.result.reply, provider: res.provider };
		})();

		let firstChunk: { token: string; provider: string } | null = null;
		try {
			const iter = await generator.next();
			if (!iter.done && iter.value) {
				firstChunk = iter.value;
			}
		} catch (streamErr) {
			if (streamErr instanceof MLBackendError && streamErr.status === 503) {
				return json(
					{ error: { code: 'MODEL_WARMING_UP', message: 'Warming up' } },
					{ status: 503 }
				);
			}
			throw streamErr;
		}

		// Construct SSE stream using live token streaming
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				let detectedProvider = firstChunk?.provider || 'gemini';
				if (firstChunk?.token) {
					const eventData = `data: ${JSON.stringify({ type: 'delta', content: firstChunk.token })}\n\n`;
					controller.enqueue(encoder.encode(eventData));
				}

				try {
					for await (const chunk of generator) {
						detectedProvider = chunk.provider;
						if (chunk.token) {
							const eventData = `data: ${JSON.stringify({ type: 'delta', content: chunk.token })}\n\n`;
							controller.enqueue(encoder.encode(eventData));
						}
					}
				} catch (streamErr) {
					console.error('Error during token streaming:', streamErr);
				}

				// Final metadata event
				const finalEvent = `data: ${JSON.stringify({ type: 'done', sources: [], provider: detectedProvider })}\n\n`;
				controller.enqueue(encoder.encode(finalEvent));
				controller.close();
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		if (err instanceof MLBackendError && err.status === 503) {
			return json({ error: { code: 'MODEL_WARMING_UP', message: 'Warming up' } }, { status: 503 });
		}
		return handleServerError(err, event);
	}
};
