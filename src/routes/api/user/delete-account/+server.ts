import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { purgeAllUserData } from '$lib/server/user/deleteUserData';

/**
 * POST /api/user/delete-account
 * GDPR/CCPA Right to Be Forgotten endpoint.
 * Purges user profile subcollections, courses, modules, quiz attempts, flashcards, weak topics, and Auth account.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const uid = user.uid;

		// Purge all user Firestore documents and subcollections recursively
		await purgeAllUserData(uid);

		// 4. Delete Auth User Record
		try {
			await adminAuth.deleteUser(uid);
		} catch (authErr) {
			console.warn('Could not delete Firebase Auth user record directly:', authErr);
		}

		return json(
			{ status: 'ok', message: 'Account and associated data successfully purged.' },
			{ status: 200 }
		);
	} catch (err) {
		console.error('Account Deletion error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to delete account' } },
			{ status: 500 }
		);
	}
};
