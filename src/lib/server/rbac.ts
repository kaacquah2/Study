import { adminDb, adminAuth } from '$lib/server/admin';
import { verifySessionUser, type AuthenticatedUser } from '$lib/server/auth';
import { normalizeRole, hasPermission, type Permission, type Role } from '$lib/rbac';

export interface RBACUser extends AuthenticatedUser {
	role: 'student' | 'instructor' | 'admin' | 'superadmin';
	isAdmin: boolean;
	isSuperAdmin: boolean;
}

/**
 * Fetches the user's role and administrative status from Firestore and Firebase Custom Claims.
 */
export async function getUserRoleAndStatus(uid: string): Promise<{
	role: 'student' | 'instructor' | 'admin' | 'superadmin';
	isBanned: boolean;
	isAdmin: boolean;
	isSuperAdmin: boolean;
}> {
	const userDoc = await adminDb.collection('users').doc(uid).get();
	const userData = userDoc.data();

	let rawRole = userData?.role;
	if (!rawRole) {
		if (userData?.isSuperAdmin) rawRole = 'superadmin';
		else if (userData?.isAdmin) rawRole = 'admin';
		else rawRole = 'student';
	}

	const normalized = normalizeRole(rawRole);
	const isBanned = userData?.isBanned === true;
	const isSuperAdmin = normalized === 'superadmin' || userData?.isSuperAdmin === true;
	const isAdmin = isSuperAdmin || normalized === 'admin' || userData?.isAdmin === true;

	return {
		role: isSuperAdmin ? 'superadmin' : isAdmin ? 'admin' : normalized,
		isBanned,
		isAdmin,
		isSuperAdmin
	};
}

/**
 * Verifies that the requesting user has administrative privileges (admin or superadmin).
 * Throws 401 Unauthorized or 403 Forbidden.
 */
export async function verifyAdmin(request: Request): Promise<RBACUser> {
	const user = await verifySessionUser(request);

	// Check claims if available in bearer token for fast-path
	let isClaimAdmin = false;
	let isClaimSuperAdmin = false;
	try {
		const authHeader = request.headers.get('Authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.substring(7);
			const decoded = await adminAuth.verifyIdToken(token);
			if (
				decoded.role === 'superadmin' ||
				decoded.superadmin === true ||
				decoded.role === 'admin' ||
				decoded.admin === true
			) {
				isClaimSuperAdmin = true;
				isClaimAdmin = true;
			}
		}
	} catch {
		// Fall back to Firestore verification
	}

	const status = await getUserRoleAndStatus(user.uid);

	// Environment admin fallback
	const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL;
	const isEnvAdmin = Boolean(
		adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase()
	);

	const isSuperAdmin = isClaimSuperAdmin || status.isSuperAdmin || status.isAdmin || isEnvAdmin;
	const isAdmin = isClaimAdmin || status.isAdmin || isSuperAdmin;

	if (!isAdmin) {
		throw new Error('FORBIDDEN: Administrator privileges required');
	}

	return {
		...user,
		role: 'admin',
		isAdmin: true,
		isSuperAdmin: true
	};
}

/**
 * Verifies that the requesting user has root superadmin privileges.
 * (Merged with verifyAdmin: any administrator has full access)
 * Throws 401 Unauthorized or 403 Forbidden.
 */
export async function verifySuperAdmin(request: Request): Promise<RBACUser> {
	return verifyAdmin(request);
}

/**
 * Verifies that the user has at least one of the allowed roles.
 */
export async function verifyRole(request: Request, allowedRoles: Role[]): Promise<RBACUser> {
	const user = await verifySessionUser(request);
	const status = await getUserRoleAndStatus(user.uid);

	const normalizedAllowed = allowedRoles.map((r) => normalizeRole(r));

	if (!normalizedAllowed.includes(status.role)) {
		throw new Error(`FORBIDDEN: Required role not found. Allowed: ${allowedRoles.join(', ')}`);
	}

	return {
		...user,
		role: status.role,
		isAdmin: status.isAdmin,
		isSuperAdmin: status.isSuperAdmin
	};
}

/**
 * Checks whether the requesting user has the required fine-grained permission.
 */
export async function requirePermission(
	request: Request,
	permission: Permission
): Promise<RBACUser> {
	const user = await verifySessionUser(request);
	const status = await getUserRoleAndStatus(user.uid);

	if (!hasPermission(status.role, permission)) {
		throw new Error(`FORBIDDEN: Missing permission ${permission}`);
	}

	return {
		...user,
		role: status.role,
		isAdmin: status.isAdmin,
		isSuperAdmin: status.isSuperAdmin
	};
}
