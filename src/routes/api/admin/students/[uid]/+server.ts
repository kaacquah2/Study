import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb, adminAuth, FieldValue } from '$lib/server/admin';
import { verifyAdmin } from '$lib/server/rbac';
import { invalidateUserSessionCache } from '$lib/server/auth';
import { normalizeRole, canAssignRole, isAdminRole } from '$lib/rbac';
import { getUserLearningProfile } from '$lib/server/analytics/profileAggregator';

export const GET: RequestHandler = async ({ request, params }) => {
	try {
		await verifyAdmin(request);
		const targetUid = params.uid;

		// 1. Fetch user doc
		const userDoc = await adminDb.collection('users').doc(targetUid).get();
		if (!userDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
		}

		const userData = userDoc.data()!;
		const rawRole =
			userData.role ||
			(userData.isSuperAdmin ? 'superadmin' : userData.isAdmin ? 'admin' : 'student');
		const role = normalizeRole(rawRole);

		// 2. Fetch user's courses
		const coursesSnap = await adminDb
			.collection('courses')
			.where('ownerUid', '==', targetUid)
			.limit(50)
			.get();

		const courses = coursesSnap.docs.map((doc) => {
			const cData = doc.data();
			return {
				id: doc.id,
				title: cData.title || 'Untitled Course',
				moduleCount: cData.moduleCount || 0,
				completedCount: cData.progress?.completed || 0,
				createdAt: cData.createdAt?.toDate
					? cData.createdAt.toDate().toISOString()
					: new Date().toISOString()
			};
		});

		// 3. Fetch user's learning profile
		const learningProfile = await getUserLearningProfile(targetUid);

		// 4. Fetch recent quiz attempts
		const quizAttemptsSnap = await adminDb
			.collection('quizAttempts')
			.where('userId', '==', targetUid)
			.limit(20)
			.get();

		const recentQuizzes = quizAttemptsSnap.docs.map((doc) => {
			const qData = doc.data();
			return {
				id: doc.id,
				courseId: qData.courseId || '',
				accuracy: qData.accuracy ?? 0,
				score: qData.score ?? 0,
				totalQuestions: qData.totalQuestions ?? 0,
				timestamp: qData.timestamp || qData.createdAt || new Date().toISOString()
			};
		});

		return json({
			student: {
				uid: targetUid,
				email: userData.email || '',
				displayName: userData.displayName || null,
				photoURL: userData.photoURL || null,
				role,
				isBanned: userData.isBanned === true,
				bannedReason: userData.bannedReason || null,
				createdAt: userData.createdAt?.toDate
					? userData.createdAt.toDate().toISOString()
					: new Date().toISOString(),
				streak: userData.streak || { current: 0, longest: 0, lastStudiedOn: null },
				courses,
				learningProfile,
				recentQuizzes
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('FORBIDDEN') || message.includes('privileges required')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		console.error('Admin Student Detail API error:', err);
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const actor = await verifyAdmin(request);
		const targetUid = params.uid;

		const userDocRef = adminDb.collection('users').doc(targetUid);
		const userDoc = await userDocRef.get();

		if (!userDoc.exists) {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Target user not found' } },
				{ status: 404 }
			);
		}

		const existingData = userDoc.data()!;
		const existingRole = normalizeRole(
			existingData.role ||
				(existingData.isSuperAdmin ? 'superadmin' : existingData.isAdmin ? 'admin' : 'student')
		);

		const body = await request.json();
		const { role: newRoleRaw, isBanned, bannedReason } = body;

		const firestoreUpdates: Record<string, unknown> = {
			updatedAt: FieldValue.serverTimestamp()
		};

		// Enforce RBAC rules on role modification
		if (newRoleRaw !== undefined) {
			const targetRole = normalizeRole(newRoleRaw);

			// Check if actor has authority to manage existing user role and target role
			if (!canAssignRole(actor.role, targetRole)) {
				return json(
					{
						error: {
							code: 'FORBIDDEN',
							message: `Insufficient privileges to assign role '${targetRole}'. Only superadmin can assign administrative roles.`
						}
					},
					{ status: 403 }
				);
			}

			// If target user is already admin or superadmin, only an administrator can modify them
			if (
				(existingRole === 'admin' || existingRole === 'superadmin') &&
				!isAdminRole(actor.role)
			) {
				return json(
					{
						error: {
							code: 'FORBIDDEN',
							message: 'Only administrators can modify existing administrators.'
						}
					},
					{ status: 403 }
				);
			}

			firestoreUpdates.role = targetRole;
			const isTargetAdmin = targetRole === 'admin' || targetRole === 'superadmin';
			firestoreUpdates.isAdmin = isTargetAdmin;
			firestoreUpdates.isSuperAdmin = isTargetAdmin;

			// Sync Custom Claims to Firebase Auth
			try {
				await adminAuth.setCustomUserClaims(targetUid, {
					role: targetRole,
					admin: isTargetAdmin,
					superadmin: targetRole === 'superadmin'
				});
			} catch (err) {
				console.warn(`[admin] Could not update custom claims for ${targetUid}:`, err);
			}
		}

		// Enforce RBAC rules on account ban/suspension
		if (isBanned !== undefined) {
			// Regular admins cannot ban other admins or superadmins
			if (
				(existingRole === 'admin' || existingRole === 'superadmin') &&
				actor.role !== 'superadmin'
			) {
				return json(
					{
						error: {
							code: 'FORBIDDEN',
							message: 'Only superadmin can suspend administrative accounts.'
						}
					},
					{ status: 403 }
				);
			}

			firestoreUpdates.isBanned = Boolean(isBanned);
			firestoreUpdates.bannedReason = isBanned
				? bannedReason || 'Account suspended by administrator'
				: null;

			// Sync Firebase Auth user disabled state
			try {
				await adminAuth.updateUser(targetUid, {
					disabled: Boolean(isBanned)
				});
			} catch (err) {
				console.warn(`[admin] Could not update Auth disabled state for ${targetUid}:`, err);
			}
		}

		await userDocRef.update(firestoreUpdates);
		await invalidateUserSessionCache(targetUid);

		return json({
			success: true,
			updated: {
				uid: targetUid,
				...firestoreUpdates
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('FORBIDDEN') || message.includes('privileges required')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		console.error('Admin Student PATCH error:', err);
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
