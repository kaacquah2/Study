import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { chat } from '$lib/server/ai/provider';
import { z } from 'zod';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { MLBackendError } from '$lib/server/ai/client';

const ChatBodySchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				content: z.string().min(1).max(2_000)
			})
		)
		.min(1)
		.max(8), // Aligned with the backend's context-window turn limit
	courseId: z.string().optional(),
	moduleId: z.string().optional(),
	courseContext: z.string().max(1_000).optional() // Fallback / legacy support
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		// Enforce user-based rate limiting (60 messages per hour)
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

		const { messages, courseId, moduleId, courseContext: rawClientContext } = parsed.data;

		// Server-side trusted context construction
		let contextToUse: string | undefined = undefined;

		if (courseId) {
			const courseDoc = await adminDb.collection('courses').doc(courseId).get();
			if (courseDoc.exists) {
				const courseData = courseDoc.data();
				// Verify access: course owner or public/shared course
				if (
					courseData &&
					(courseData.ownerUid === user.uid ||
						courseData.userId === user.uid ||
						courseData.isPublic)
				) {
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
								if (modData.type === 'lesson' && Array.isArray(modData.pages)) {
									context += `Lesson content:\n`;
									modData.pages.forEach((p: { heading?: string; body?: string }, i: number) => {
										context += `Page ${i + 1}: ${p.heading || ''}\n${p.body || ''}\n`;
									});
								} else if (modData.type === 'quiz' && Array.isArray(modData.questions)) {
									context += `Quiz questions:\n`;
									modData.questions.forEach(
										(q: { prompt?: string; options?: string[] }, i: number) => {
											context += `Question ${i + 1}: ${q.prompt || ''}\nOptions:\n${(q.options || []).map((o: string, idx: number) => ` - ${String.fromCharCode(65 + idx)}: ${o}`).join('\n')}\n`;
										}
									);
								}
							}
						}
					}
					contextToUse = context.slice(0, 1_000);
				}
			}
		}

		// Fallback to client context if no courseId supplied (e.g. legacy caller)
		if (!contextToUse && rawClientContext) {
			const cleanRaw = rawClientContext
				// eslint-disable-next-line no-control-regex
				.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
				.replace(/system:/gi, '')
				.replace(/ignore (previous|above|all)/gi, '')
				.trim();
			contextToUse = cleanRaw.slice(0, 1_000);
		}

		const { result: chatResult, provider } = await chat(messages, contextToUse, user.uid);

		return json({ reply: chatResult.reply, sources: chatResult.sources || [], provider });
	} catch (err) {
		console.error('Chat API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		if (err instanceof MLBackendError) {
			if (err.status === 503) {
				return json(
					{
						error: {
							code: 'MODEL_WARMING_UP',
							message:
								'The AI Study Assistant is currently warming up models in the background. Please wait a few seconds and try again.'
						}
					},
					{ status: 503 }
				);
			}
			return json(
				{
					error: {
						code: 'SERVER_ERROR',
						message: err.message || 'AI assistant is temporarily unavailable. Please try again.'
					}
				},
				{ status: err.status >= 400 && err.status < 600 ? err.status : 500 }
			);
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
