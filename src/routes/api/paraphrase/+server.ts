import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { paraphrase } from '$lib/server/ai/provider';
import { z } from 'zod';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { MLBackendError } from '$lib/server/ai/client';

const ParaphraseBodySchema = z.object({
	text: z.string().min(10).max(2_000),
	style: z.enum(['academic', 'simple', 'formal']).optional()
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		// Enforce user-based rate limiting (60 requests per hour)
		const hourStr = Math.floor(Date.now() / 3600000).toString();
		const usageRef = adminDb.collection('usage').doc(user.uid);
		try {
			await enforceRateLimit(usageRef, 60, hourStr, 'paraphraseCount', 'paraphraseHour');
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message: 'Rate limit exceeded. You can paraphrase up to 60 times per hour.'
						}
					},
					{ status: 429 }
				);
			}
			throw rateErr;
		}

		const body = await request.json();
		const parsed = ParaphraseBodySchema.safeParse(body);

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

		const { text, style = 'academic' } = parsed.data;
		const { result: paraphraseResult, provider } = await paraphrase(text, style, user.uid);

		return json({ paraphrase: paraphraseResult, provider });
	} catch (err) {
		console.error('Paraphrase API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		const clientMessage =
			err instanceof MLBackendError
				? 'Failed to paraphrase text. Please try again later.'
				: message || 'Internal Server Error';
		return json({ error: { code: 'SERVER_ERROR', message: clientMessage } }, { status: 500 });
	}
};
