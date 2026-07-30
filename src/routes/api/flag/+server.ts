import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';

const FlagZod = z.object({
	courseId: z.string(),
	moduleId: z.string().optional(),
	contentType: z.enum(['lesson', 'quiz', 'course', 'chat']),
	reason: z.string().min(1).max(500)
});

export async function POST({ request }) {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = FlagZod.safeParse(body);

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

		const { courseId, moduleId, contentType, reason } = parsed.data;

		const flagRef = adminDb.collection('flags').doc();
		await flagRef.set({
			id: flagRef.id,
			userId: user.uid,
			userEmail: user.email || null,
			courseId,
			moduleId: moduleId || null,
			contentType,
			reason,
			createdAt: FieldValue.serverTimestamp()
		});

		return json({ status: 'ok', flagId: flagRef.id }, { status: 201 });
	} catch (err) {
		console.error('Flag API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
}
