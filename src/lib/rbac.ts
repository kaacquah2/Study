export type Role = 'student' | 'user' | 'instructor' | 'admin' | 'superadmin';

export type Permission =
	| 'study:read'
	| 'study:create'
	| 'study:take_quiz'
	| 'study:join_group'
	| 'admin:view_dashboard'
	| 'admin:view_students'
	| 'admin:manage_students'
	| 'admin:view_analytics'
	| 'admin:view_system_health'
	| 'superadmin:manage_roles'
	| 'superadmin:manage_admins'
	| 'superadmin:system_settings';

const STUDENT_PERMISSIONS: Permission[] = [
	'study:read',
	'study:create',
	'study:take_quiz',
	'study:join_group'
];

const INSTRUCTOR_PERMISSIONS: Permission[] = [
	...STUDENT_PERMISSIONS,
	'admin:view_dashboard',
	'admin:view_students',
	'admin:view_analytics'
];

const ADMIN_PERMISSIONS: Permission[] = [
	...INSTRUCTOR_PERMISSIONS,
	'admin:manage_students',
	'admin:view_system_health',
	'superadmin:manage_roles',
	'superadmin:manage_admins',
	'superadmin:system_settings'
];

const SUPERADMIN_PERMISSIONS: Permission[] = [...ADMIN_PERMISSIONS];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
	student: STUDENT_PERMISSIONS,
	user: STUDENT_PERMISSIONS,
	instructor: INSTRUCTOR_PERMISSIONS,
	admin: ADMIN_PERMISSIONS,
	superadmin: SUPERADMIN_PERMISSIONS
};

/**
 * Normalizes any role string to canonical 'student' | 'admin' | 'superadmin' | 'instructor'.
 * 'user' is mapped to 'student' for backwards compatibility.
 */
export function normalizeRole(
	role?: string | null
): 'student' | 'instructor' | 'admin' | 'superadmin' {
	if (!role) return 'student';
	const lower = role.toLowerCase().trim();
	if (lower === 'superadmin') return 'superadmin';
	if (lower === 'admin') return 'admin';
	if (lower === 'instructor') return 'instructor';
	return 'student';
}

/**
 * Checks if a role has administrator status (admin or superadmin).
 */
export function isAdminRole(role?: string | null): boolean {
	const normalized = normalizeRole(role);
	return normalized === 'admin' || normalized === 'superadmin';
}

/**
 * Checks if a role has root superadmin status.
 * Any administrator has full root privileges.
 */
export function isSuperAdminRole(role?: string | null): boolean {
	return isAdminRole(role);
}

/**
 * Checks if a role is a student / regular learner.
 */
export function isStudentRole(role?: string | null): boolean {
	const normalized = normalizeRole(role);
	return normalized === 'student';
}

/**
 * Checks if a role has a specific permission.
 */
export function hasPermission(role: string | undefined | null, permission: Permission): boolean {
	const normalized = normalizeRole(role);
	const permissions = ROLE_PERMISSIONS[normalized] || STUDENT_PERMISSIONS;
	return permissions.includes(permission);
}

/**
 * Checks if an actor with actorRole can assign or change to targetRole.
 * Any admin has full role management authority.
 */
export function canAssignRole(actorRole: string | undefined | null, targetRole: string): boolean {
	const actorNorm = normalizeRole(actorRole);
	if (actorNorm === 'admin' || actorNorm === 'superadmin') {
		return true;
	}
	return false;
}
