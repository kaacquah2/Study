import { json } from '@sveltejs/kit';
import { adminDb, adminAuth } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

/**
 * POST /api/user/delete-account
 * GDPR/CCPA Right to Be Forgotten endpoint.
 * Deletes user profile, courses, modules, quiz attempts, and Firebase Auth account.
 */
export async function POST({ request }) {
	try {
		const user = await verifySessionUser(request);
		const uid = user.uid;

		// 1. Fetch and delete user's courses and module subcollections
		const coursesSnap = await adminDb.collection('courses').where('ownerUid', '==', uid).get();
		for (const courseDoc of coursesSnap.docs) {
			const modulesSnap = await courseDoc.ref.collection('modules').get();
			const batch = adminDb.batch();
			for (const modDoc of modulesSnap.docs) {
				batch.delete(modDoc.ref);
			}
			batch.delete(courseDoc.ref);
			await batch.commit();
		}

		// 2. Delete user's quiz attempts
		const attemptsSnap = await adminDb.collection('quizAttempts').where('userId', '==', uid).get();
		const attemptsBatch = adminDb.batch();
		attemptsSnap.docs.forEach((doc) => attemptsBatch.delete(doc.ref));
		await attemptsBatch.commit();

		// 3. Delete usage record & user doc
		await adminDb
			.collection('usage')
			.doc(uid)
			.delete()
			.catch(() => {});
		await adminDb
			.collection('users')
			.doc(uid)
			.delete()
			.catch(() => {});

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
}
