import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySuperAdmin } from './user';
import * as authModule from '$lib/server/auth';
import * as adminModule from '$lib/server/admin';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockGet = vi.fn();
	const mockDoc = vi.fn(() => ({ get: mockGet }));
	const mockCollection = vi.fn(() => ({ doc: mockDoc }));
	return {
		adminDb: { collection: mockCollection },
		adminAuth: { verifyIdToken: vi.fn() },
		FieldValue: { serverTimestamp: vi.fn() }
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
