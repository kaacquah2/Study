import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySuperAdmin, getUserDetails, updateUserAdminState } from './user';
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

describe('verifySuperAdmin Security Check', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should allow user with role === "superadmin"', async () => {
		const fakeUser = { uid: 'super_1', email: 'super@example.com' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeUser);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'superadmin' })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/superadmin/users');
		const result = await verifySuperAdmin(req);
		expect(result.uid).toBe('super_1');
	});

	it('should REJECT user with isAdmin === true (privilege escalation check)', async () => {
		const fakeAdmin = { uid: 'admin_1', email: 'admin@example.com' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeAdmin);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'admin', isAdmin: true, isSuperAdmin: false })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/superadmin/users');
		await expect(verifySuperAdmin(req)).rejects.toThrow(
			'FORBIDDEN: Super Admin privileges required'
		);
	});

	it('should REJECT standard user with role === "user"', async () => {
		const fakeUser = { uid: 'user_1', email: 'user@example.com' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeUser);

		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ role: 'user', isAdmin: false, isSuperAdmin: false })
		});
		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({ get: mockDocGet })
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/superadmin/users');
		await expect(verifySuperAdmin(req)).rejects.toThrow(
			'FORBIDDEN: Super Admin privileges required'
		);
	});
});

describe('getUserDetails', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('queries courses collection by ownerUid and returns course details', async () => {
		const mockUserDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({
				email: 'student@example.com',
				displayName: 'Student One',
				photoURL: null,
				role: 'user',
				isBanned: false,
				createdAt: { toDate: () => new Date('2026-01-01T00:00:00Z') },
				streak: { current: 3, longest: 7 }
			})
		});

		const mockCoursesGet = vi.fn().mockResolvedValue({
			docs: [
				{
					id: 'course_1',
					data: () => ({
						title: 'TypeScript Mastery',
						ownerUid: 'student_123',
						createdAt: { toDate: () => new Date('2026-01-15T00:00:00Z') }
					})
				},
				{
					id: 'course_2',
					data: () => ({
						title: 'Rust Basics',
						ownerUid: 'student_123',
						createdAt: { toDate: () => new Date('2026-02-01T00:00:00Z') }
					})
				}
			]
		});

		const mockLimit = vi.fn().mockReturnValue({ get: mockCoursesGet });
		const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });

		vi.mocked(adminModule.adminDb.collection).mockImplementation((collName: string) => {
			if (collName === 'users') {
				return {
					doc: vi.fn().mockReturnValue({ get: mockUserDocGet })
				} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
			}
			if (collName === 'courses') {
				return {
					where: mockWhere
				} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
			}
			return {} as ReturnType<typeof adminModule.adminDb.collection>;
		});

		const details = await getUserDetails('student_123');

		expect(mockWhere).toHaveBeenCalledWith('ownerUid', '==', 'student_123');
		expect(mockLimit).toHaveBeenCalledWith(100);
		expect(details.uid).toBe('student_123');
		expect(details.email).toBe('student@example.com');
		expect(details.courseCount).toBe(2);
		expect(details.courses).toEqual([
			{
				id: 'course_1',
				title: 'TypeScript Mastery',
				createdAt: '2026-01-15T00:00:00.000Z'
			},
			{
				id: 'course_2',
				title: 'Rust Basics',
				createdAt: '2026-02-01T00:00:00.000Z'
			}
		]);
	});
});

describe('updateUserAdminState', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('updates ban status, disables auth user, and actively invalidates user session cache', async () => {
		const mockUpdate = vi.fn().mockResolvedValue(undefined);
		const mockDocGet = vi.fn().mockResolvedValue({
			exists: true,
			data: () => ({ isBanned: false })
		});

		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({
				get: mockDocGet,
				update: mockUpdate
			})
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		await updateUserAdminState('user_to_ban', {
			isBanned: true,
			bannedReason: 'Suspicious activity detected'
		});

		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				isBanned: true,
				bannedReason: 'Suspicious activity detected'
			})
		);
		expect(adminModule.adminAuth.updateUser).toHaveBeenCalledWith('user_to_ban', {
			disabled: true
		});
		expect(authModule.invalidateUserSessionCache).toHaveBeenCalledWith('user_to_ban');
	});
});
