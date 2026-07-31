import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { enhanceTopic } from '$lib/server/ai/provider';
import { z } from 'zod';

const RequestSchema = z.object({
	topic: z.string().min(2).max(200)
});

// POST /api/courses/enhance-topic
export const POST: RequestHandler = async ({ request }) => {
	try {
		await verifySessionUser(request);

		const body = await request.json();
		const parsed = RequestSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Topic is too short or invalid' } },
				{ status: 400 }
			);
		}

		const { topic } = parsed.data;
		const res = await enhanceTopic(topic);

		return json({
			enhancedTopic: res.result.enhancedTopic,
			suggestions: res.result.suggestions || [],
			provider: res.provider
		});
	} catch (err) {
		console.error('Enhance topic error:', err);
		const message = err instanceof Error ? err.message : 'Failed to enhance topic';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
