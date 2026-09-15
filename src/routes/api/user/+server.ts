import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminAuth, adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser, invalidateUserSessionCache } from '$lib/server/auth';
import { purgeAllUserData } from '$lib/server/user/deleteUserData';

/**
 * GET /api/user
 * Returns the current authenticated user's profile.
 */
export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const userDoc = await adminDb.collection('users').doc(user.uid).get();

		if (!userDoc.exists) {
			return json(
				{
					user: {
						uid: user.uid,
						email: user.email || null,
						role: 'student'
					}
				},
				{ status: 200 }
			);
		}

		return json(
			{
				user: {
					uid: user.uid,
					...userDoc.data()
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to fetch user profile' } },
			{ status: 500 }
		);
	}
};

/**
 * PATCH /api/user
 * Updates safe profile fields for the authenticated user (e.g. onboardingComplete, displayName, theme, photoURL).
 */
export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json().catch(() => ({}));

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return json(
				{ error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' } },
				{ status: 400 }
			);
		}

		const updates: Record<string, unknown> = {};

		// Allowed safe mutable fields
		if (typeof body.onboardingComplete === 'boolean') {
			updates.onboardingComplete = body.onboardingComplete;
		}

		if (typeof body.displayName === 'string') {
			const trimmed = body.displayName.trim();
			if (trimmed.length > 0 && trimmed.length <= 100) {
				updates.displayName = trimmed;
			}
		}

		if (body.photoURL === null || typeof body.photoURL === 'string') {
			updates.photoURL = body.photoURL;
		}

		if (typeof body.theme === 'string' && ['light', 'dark'].includes(body.theme)) {
			updates.theme = body.theme;
		}

		if (Object.keys(updates).length === 0) {
			return json(
				{ error: { code: 'BAD_REQUEST', message: 'No valid profile fields provided for update.' } },
				{ status: 400 }
			);
		}

		updates.updatedAt = FieldValue.serverTimestamp();

		const userRef = adminDb.collection('users').doc(user.uid);
		await userRef.set(updates, { merge: true });

		await invalidateUserSessionCache(user.uid);

		return json(
			{
				status: 'ok',
				message: 'User profile updated successfully.',
				updated: updates
			},
			{ status: 200 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to update user profile' } },
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/user
 * GDPR/CCPA Right to Be Forgotten endpoint.
 * Purges user profile subcollections, courses, modules, quiz attempts, flashcards, weak topics, and Auth account.
 */
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const uid = user.uid;

		// Purge all user Firestore documents and subcollections recursively
		await purgeAllUserData(uid);

		// Invalidate L1/L2 session cache
		await invalidateUserSessionCache(uid);

		// Delete Auth User Record
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
