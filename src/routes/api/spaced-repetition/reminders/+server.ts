import { json, type RequestHandler } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb } from '$lib/server/admin';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		const today = new Date().toISOString().split('T')[0];
		const cardsRef = adminDb.collection('users').doc(user.uid).collection('cards');

		const dueQuery = cardsRef.where('nextReviewDate', '<=', today);
		const snapshot = await dueQuery.get();

		const dueCount = snapshot.size;

		let message = 'Your review queue is clean!';
		if (dueCount > 0) {
			message = `You have ${dueCount} card${dueCount > 1 ? 's' : ''} due for review today.`;
		}

		return json({
			success: true,
			dueCount,
			today,
			message
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to fetch review reminders';
		return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
	}
};
