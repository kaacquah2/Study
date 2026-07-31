import type { RequestHandler } from './$types';
/**
 * /api/spaced-repetition/export — Export flashcard decks to CSV or Anki format.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb } from '$lib/server/admin';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await verifySessionUser(request);
		const format = url.searchParams.get('format') || 'csv';

		const snapshot = await adminDb.collection('flashcards').where('uid', '==', user.uid).get();

		const cards = snapshot.docs.map((doc) => doc.data());

		if (format === 'csv') {
			let csv = 'Front,Back,Engine,State,DueDate\n';
			for (const c of cards) {
				const front = `"${(c.front || '').replace(/"/g, '""')}"`;
				const back = `"${(c.back || '').replace(/"/g, '""')}"`;
				csv += `${front},${back},${c.engine || 'fsrs'},${c.state || 'New'},${c.dueDate || ''}\n`;
			}

			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="ai_study_buddy_flashcards_${user.uid.slice(0, 6)}.csv"`
				}
			});
		}

		return json({ cards });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
