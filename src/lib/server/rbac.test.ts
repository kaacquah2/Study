import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	normalizeRole,
	isAdminRole,
	isSuperAdminRole,
	isStudentRole,
	hasPermission,
	canAssignRole
} from '$lib/rbac';
import { verifyAdmin, verifySuperAdmin, verifyRole, requirePermission } from './rbac';
import * as authModule from '$lib/server/auth';
import * as adminModule from '$lib/server/admin';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn(),
	invalidateUserSessionCache: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/admin', () => {
	const mockGet = vi.fn();
	const mockUpdate = vi.fn();
	const mockDoc = vi.fn(() => ({ get: mockGet, update: mockUpdate }));
	const mockCollection = vi.fn(() => ({ doc: mockDoc }));
	return {
		adminDb: { collection: mockCollection },
		adminAuth: {
			verifyIdToken: vi.fn(),
			updateUser: vi.fn().mockResolvedValue(undefined),
			setCustomUserClaims: vi.fn().mockResolvedValue(undefined)
		},
		FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP') }
	};
});

describe('RBAC Shared Utilities ($lib/rbac)', () => {
	it('normalizes roles correctly', () => {
		expect(normalizeRole('user')).toBe('student');
		expect(normalizeRole('student')).toBe('student');
		expect(normalizeRole('STUDENT')).toBe('student');
		expect(normalizeRole('admin')).toBe('admin');
		expect(normalizeRole('ADMIN')).toBe('admin');
		expect(normalizeRole('superadmin')).toBe('superadmin');
		expect(normalizeRole('instructor')).toBe('instructor');
		expect(normalizeRole(null)).toBe('student');
		expect(normalizeRole(undefined)).toBe('student');
	});

	it('identifies role classifications correctly', () => {
		expect(isAdminRole('admin')).toBe(true);
		expect(isAdminRole('superadmin')).toBe(true);
		expect(isAdminRole('student')).toBe(false);
		expect(isAdminRole('user')).toBe(false);

		expect(isSuperAdminRole('superadmin')).toBe(true);
		expect(isSuperAdminRole('admin')).toBe(true);

		expect(isStudentRole('student')).toBe(true);
		expect(isStudentRole('user')).toBe(true);
		expect(isStudentRole('admin')).toBe(false);
	});

	it('checks fine-grained permissions', () => {
		expect(hasPermission('student', 'study:read')).toBe(true);
		expect(hasPermission('student', 'study:take_quiz')).toBe(true);
		expect(hasPermission('student', 'admin:view_dashboard')).toBe(false);
		expect(hasPermission('student', 'admin:manage_students')).toBe(false);

		expect(hasPermission('admin', 'admin:view_dashboard')).toBe(true);
		expect(hasPermission('admin', 'admin:manage_students')).toBe(true);
		expect(hasPermission('admin', 'superadmin:manage_roles')).toBe(true);

		expect(hasPermission('superadmin', 'superadmin:manage_roles')).toBe(true);
		expect(hasPermission('superadmin', 'admin:view_dashboard')).toBe(true);
	});

	it('enforces role assignment hierarchy with canAssignRole', () => {
		// Any admin or superadmin can assign all roles
		expect(canAssignRole('superadmin', 'admin')).toBe(true);
		expect(canAssignRole('superadmin', 'superadmin')).toBe(true);
		expect(canAssignRole('superadmin', 'student')).toBe(true);

		expect(canAssignRole('admin', 'student')).toBe(true);
		expect(canAssignRole('admin', 'instructor')).toBe(true);
		expect(canAssignRole('admin', 'admin')).toBe(true);
		expect(canAssignRole('admin', 'superadmin')).toBe(true);

		// Student cannot assign roles
		expect(canAssignRole('student', 'admin')).toBe(false);
		expect(canAssignRole('student', 'student')).toBe(false);
	});
});

describe('Server RBAC Guard ($lib/server/rbac)', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('verifyAdmin allows admin and superadmin users', async () => {
		const fakeAdmin = { uid: 'adm_1', email: 'admin@school.edu' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeAdmin);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'admin', isAdmin: true })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/analytics');
		const result = await verifyAdmin(req);
		expect(result.uid).toBe('adm_1');
		expect(result.isAdmin).toBe(true);
	});

	it('verifyAdmin rejects student user with 403 Forbidden', async () => {
		const fakeStudent = { uid: 'stud_1', email: 'student@school.edu' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeStudent);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'student', isAdmin: false, isSuperAdmin: false })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/analytics');
		await expect(verifyAdmin(req)).rejects.toThrow('FORBIDDEN');
	});

	it('verifySuperAdmin allows admin user (merged admin model)', async () => {
		const fakeAdmin = { uid: 'adm_2', email: 'admin2@school.edu' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeAdmin);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'admin', isAdmin: true })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/system');
		const result = await verifySuperAdmin(req);
		expect(result.uid).toBe('adm_2');
		expect(result.isAdmin).toBe(true);
	});

	it('verifyRole validates allowed roles', async () => {
		const fakeUser = { uid: 'stud_2', email: 'student2@school.edu' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeUser);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'student' })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/study');
		const res = await verifyRole(req, ['student', 'admin']);
		expect(res.role).toBe('student');

		await expect(verifyRole(req, ['admin', 'superadmin'])).rejects.toThrow('FORBIDDEN');
	});

	it('requirePermission checks fine-grained permissions', async () => {
		const fakeUser = { uid: 'stud_3', email: 'student3@school.edu' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeUser);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'student' })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/quiz');
		const res = await requirePermission(req, 'study:take_quiz');
		expect(res.uid).toBe('stud_3');

		await expect(requirePermission(req, 'admin:manage_students')).rejects.toThrow('FORBIDDEN');
	});
});
