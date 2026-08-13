import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();

		const front = (body?.front || '').trim();
		const back = (body?.back || '').trim();
		const courseId = body?.courseId || null;
		const moduleId = body?.moduleId || null;

		if (!front) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Flashcard front content cannot be empty.' } },
				{ status: 400 }
			);
		}

		const now = new Date().toISOString();
		const cardRef = adminDb.collection('flashcards').doc();

		const cardData = {
			id: cardRef.id,
			uid: user.uid,
			courseId,
			moduleId,
			sourceType: 'user_created',
			front,
			back: back || 'No description provided.',
			engine: 'fsrs',
			stability: 0,
			difficulty: 5,
			reps: 0,
			lapses: 0,
			state: 'New',
			dueDate: now.split('T')[0],
			createdAt: now
		};

		await cardRef.set(cardData);

		return json({
			success: true,
			flashcard: cardData
		});
	} catch (err) {
		console.error('Save flashcard error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
