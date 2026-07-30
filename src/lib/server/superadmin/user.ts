import { adminDb, adminAuth, FieldValue } from '$lib/server/admin';
import { verifySessionUser, type AuthenticatedUser } from '$lib/server/auth';

export interface UserRecord {
	uid: string;
	email: string;
	displayName: string | null;
	photoURL: string | null;
	role: 'user' | 'admin' | 'superadmin';
	isBanned: boolean;
	bannedReason?: string | null;
	createdAt: string;
	streakCurrent?: number;
	streakLongest?: number;
	courseCount?: number;
}

export interface SuperAdminStats {
	totalUsers: number;
	adminUsers: number;
	superadminUsers: number;
	bannedUsers: number;
	recentUsersCount: number;
}

/**
 * Ensures the requesting user has superadmin privileges.
 * Checks Firestore document `role === 'superadmin'` or `isSuperAdmin === true`
 * or Firebase Auth custom claim `superadmin === true`.
 */
export async function verifySuperAdmin(request: Request): Promise<AuthenticatedUser> {
	const user = await verifySessionUser(request);

	// Check Firestore user doc
	const userDoc = await adminDb.collection('users').doc(user.uid).get();
	const userData = userDoc.data();

	// Check decoded token custom claims if available
	let isSuperAdminClaim = false;
	try {
		const authHeader = request.headers.get('Authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const decoded = await adminAuth.verifyIdToken(authHeader.substring(7));
			if (decoded.superadmin === true || decoded.role === 'superadmin') {
				isSuperAdminClaim = true;
			}
		}
	} catch {
		// Ignore token decode error if already verified by verifySessionUser
	}

	const isSuperAdminDoc =
		userData?.role === 'superadmin' ||
		userData?.isSuperAdmin === true ||
		userData?.isAdmin === true;

	if (!isSuperAdminClaim && !isSuperAdminDoc) {
		// Fallback check: if user is the first admin/owner or environment override
		const superAdminEmail = process.env.SUPERADMIN_EMAIL;
		if (superAdminEmail && user.email?.toLowerCase() === superAdminEmail.toLowerCase()) {
			// Super admin by environment configuration
			return user;
		}

		throw new Error('FORBIDDEN: Super Admin privileges required');
	}

	return user;
}

/**
 * Get aggregate statistics for the Super Admin overview dashboard.
 */
export async function getSuperAdminStats(): Promise<SuperAdminStats> {
	const usersSnap = await adminDb.collection('users').get();
	const totalUsers = usersSnap.size;

	let adminUsers = 0;
	let superadminUsers = 0;
	let bannedUsers = 0;
	let recentUsersCount = 0;

	const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

	for (const doc of usersSnap.docs) {
		const data = doc.data();

		if (data.role === 'superadmin' || data.isSuperAdmin === true) {
			superadminUsers++;
		} else if (data.role === 'admin' || data.isAdmin === true) {
			adminUsers++;
		}

		if (data.isBanned === true) {
			bannedUsers++;
		}

		const createdAtMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
		if (createdAtMs > thirtyDaysAgo) {
			recentUsersCount++;
		}
	}

	return {
		totalUsers,
		adminUsers,
		superadminUsers,
		bannedUsers,
		recentUsersCount
	};
}

/**
 * Query and filter user records from Firestore.
 */
export async function listUsers(queryOptions: {
	q?: string;
	role?: string;
	status?: string;
}): Promise<UserRecord[]> {
	const usersSnap = await adminDb.collection('users').get();
	const users: UserRecord[] = [];

	const qLower = queryOptions.q?.toLowerCase().trim() || '';
	const roleFilter = queryOptions.role?.toLowerCase() || 'all';
	const statusFilter = queryOptions.status?.toLowerCase() || 'all';

	for (const doc of usersSnap.docs) {
		const data = doc.data();
		const uid = doc.id;
		const email = data.email || '';
		const displayName = data.displayName || null;
		const photoURL = data.photoURL || null;

		let role: 'user' | 'admin' | 'superadmin' = 'user';
		if (data.role === 'superadmin' || data.isSuperAdmin === true) {
			role = 'superadmin';
		} else if (data.role === 'admin' || data.isAdmin === true) {
			role = 'admin';
		}

		const isBanned = data.isBanned === true;

		// Filter by search query
		if (qLower) {
			const matchesEmail = email.toLowerCase().includes(qLower);
			const matchesName = (displayName || '').toLowerCase().includes(qLower);
			const matchesUid = uid.toLowerCase().includes(qLower);

			if (!matchesEmail && !matchesName && !matchesUid) {
				continue;
			}
		}

		// Filter by role
		if (roleFilter !== 'all' && role !== roleFilter) {
			continue;
		}

		// Filter by status
		if (statusFilter === 'banned' && !isBanned) continue;
		if (statusFilter === 'active' && isBanned) continue;

		const createdAt = data.createdAt?.toDate
			? data.createdAt.toDate().toISOString()
			: new Date().toISOString();

		users.push({
			uid,
			email,
			displayName,
			photoURL,
			role,
			isBanned,
			bannedReason: data.bannedReason || null,
			createdAt,
			streakCurrent: data.streak?.current || 0,
			streakLongest: data.streak?.longest || 0
		});
	}

	// Sort by createdAt descending
	users.sort((a, b) => ((a.createdAt || '') > (b.createdAt || '') ? -1 : 1));

	return users;
}

/**
 * Fetch detailed user record including generated course statistics.
 */
export async function getUserDetails(
	uid: string
): Promise<UserRecord & { courses: Array<{ id: string; title: string; createdAt: string }> }> {
	const userDoc = await adminDb.collection('users').doc(uid).get();

	if (!userDoc.exists) {
		throw new Error('User not found');
	}

	const data = userDoc.data()!;
	const email = data.email || '';
	const displayName = data.displayName || null;
	const photoURL = data.photoURL || null;

	let role: 'user' | 'admin' | 'superadmin' = 'user';
	if (data.role === 'superadmin' || data.isSuperAdmin === true) {
		role = 'superadmin';
	} else if (data.role === 'admin' || data.isAdmin === true) {
		role = 'admin';
	}

	const coursesSnap = await adminDb.collection('courses').where('userId', '==', uid).get();

	const courses = coursesSnap.docs.map((d) => {
		const cData = d.data();
		return {
			id: d.id,
			title: cData.title || 'Untitled Course',
			createdAt: cData.createdAt?.toDate
				? cData.createdAt.toDate().toISOString()
				: new Date().toISOString()
		};
	});

	return {
		uid,
		email,
		displayName,
		photoURL,
		role,
		isBanned: data.isBanned === true,
		bannedReason: data.bannedReason || null,
		createdAt: data.createdAt?.toDate
			? data.createdAt.toDate().toISOString()
			: new Date().toISOString(),
		streakCurrent: data.streak?.current || 0,
		streakLongest: data.streak?.longest || 0,
		courseCount: courses.length,
		courses
	};
}

/**
 * Update administrative user status (role and ban status).
 */
export async function updateUserAdminState(
	targetUid: string,
	updates: {
		role?: 'user' | 'admin' | 'superadmin';
		isBanned?: boolean;
		bannedReason?: string | null;
	}
): Promise<void> {
	const userDocRef = adminDb.collection('users').doc(targetUid);
	const docSnap = await userDocRef.get();

	if (!docSnap.exists) {
		throw new Error('Target user does not exist');
	}

	const firestoreUpdates: Record<string, unknown> = {
		updatedAt: FieldValue.serverTimestamp()
	};

	if (updates.role !== undefined) {
		firestoreUpdates.role = updates.role;
		firestoreUpdates.isAdmin = updates.role === 'admin' || updates.role === 'superadmin';
		firestoreUpdates.isSuperAdmin = updates.role === 'superadmin';

		// Sync Firebase Auth Custom Claims
		try {
			await adminAuth.setCustomUserClaims(targetUid, {
				role: updates.role,
				admin: updates.role === 'admin' || updates.role === 'superadmin',
				superadmin: updates.role === 'superadmin'
			});
		} catch (err) {
			console.warn(`[superadmin] Could not update custom claims for ${targetUid}:`, err);
		}
	}

	if (updates.isBanned !== undefined) {
		firestoreUpdates.isBanned = updates.isBanned;
		firestoreUpdates.bannedReason = updates.isBanned
			? updates.bannedReason || 'Account suspended by administrator'
			: null;

		// Disable/enable Firebase Auth user account
		try {
			await adminAuth.updateUser(targetUid, {
				disabled: updates.isBanned
			});
		} catch (err) {
			console.warn(`[superadmin] Could not update Auth disabled state for ${targetUid}:`, err);
		}
	}

	await userDocRef.update(firestoreUpdates);
}
