import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { summarize } from '$lib/server/ai/provider';
import { z } from 'zod';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { handleServerError } from '$lib/server/apiError';

const SummarizeBodySchema = z.object({
	text: z.string().min(50).max(10_000),
	maxLength: z.number().int().min(30).max(400).optional(),
	minLength: z.number().int().min(10).max(200).optional()
});

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	try {
		const user = await verifySessionUser(request);

		// Enforce user-based rate limiting (60 requests per hour)
		const hourStr = Math.floor(Date.now() / 3600000).toString();
		const usageRef = adminDb.collection('usage').doc(user.uid);
		try {
			await enforceRateLimit(usageRef, 60, hourStr, 'summarizeCount', 'summarizeHour');
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message: 'Rate limit exceeded. You can summarize up to 60 times per hour.'
						}
					},
					{ status: 429 }
				);
			}
			throw rateErr;
		}

		const body = await request.json();
		const parsed = SummarizeBodySchema.safeParse(body);

		if (!parsed.success) {
			console.warn('[summarize POST] Validation failed:', parsed.error.issues);
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

		const { text, maxLength = 150, minLength = 40 } = parsed.data;
		const { result: summary, provider } = await summarize(text, maxLength, minLength, user.uid);

		return json({ summary, provider });
	} catch (err) {
		console.error('Summarize API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event, 'Failed to summarize text. Please try again later.');
	}
};
