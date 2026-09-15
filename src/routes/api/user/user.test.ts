import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from './+server';
import * as authModule from '$lib/server/auth';
import * as adminModule from '$lib/server/admin';
import * as deleteUserModule from '$lib/server/user/deleteUserData';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn(),
	invalidateUserSessionCache: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/user/deleteUserData', () => ({
	purgeAllUserData: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/admin', () => {
	const mockDoc = {
		get: vi.fn(),
		set: vi.fn().mockResolvedValue(undefined)
	};
	const mockCollection = vi.fn(() => ({
		doc: vi.fn(() => mockDoc)
	}));

	return {
		adminDb: { collection: mockCollection },
		adminAuth: {
			deleteUser: vi.fn().mockResolvedValue(undefined)
		},
		FieldValue: {
			serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP')
		}
	};
});

describe('/api/user Endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('GET /api/user returns the authenticated user profile', async () => {
		vi.mocked(authModule.verifySessionUser).mockResolvedValue({
			uid: 'usr_123',
			email: 'student@example.com'
		});

		const mockDocRef = adminModule.adminDb.collection('users').doc('usr_123');
		vi.mocked(mockDocRef.get).mockResolvedValue({
			exists: true,
			data: () => ({
				displayName: 'Jane Doe',
				onboardingComplete: true,
				theme: 'dark'
			})
		} as unknown as Awaited<ReturnType<typeof mockDocRef.get>>);

		const response = await GET({
			request: new Request('http://localhost/api/user')
		} as unknown as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.user.uid).toBe('usr_123');
		expect(json.user.displayName).toBe('Jane Doe');
		expect(json.user.onboardingComplete).toBe(true);
	});

	it('PATCH /api/user updates onboardingComplete successfully', async () => {
		vi.mocked(authModule.verifySessionUser).mockResolvedValue({
			uid: 'usr_123',
			email: 'student@example.com'
		});

		const mockDocRef = adminModule.adminDb.collection('users').doc('usr_123');

		const request = new Request('http://localhost/api/user', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ onboardingComplete: true })
		});

		const response = await PATCH({ request } as unknown as Parameters<typeof PATCH>[0]);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.status).toBe('ok');
		expect(json.updated.onboardingComplete).toBe(true);
		expect(mockDocRef.set).toHaveBeenCalledWith(
			expect.objectContaining({
				onboardingComplete: true,
				updatedAt: 'MOCK_TIMESTAMP'
			}),
			{ merge: true }
		);
		expect(authModule.invalidateUserSessionCache).toHaveBeenCalledWith('usr_123');
	});

	it('PATCH /api/user rejects unauthorized requests', async () => {
		vi.mocked(authModule.verifySessionUser).mockRejectedValue(new Error('Unauthorized session'));

		const request = new Request('http://localhost/api/user', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ onboardingComplete: true })
		});

		const response = await PATCH({ request } as unknown as Parameters<typeof PATCH>[0]);
		expect(response.status).toBe(401);
	});

	it('PATCH /api/user rejects when no valid profile fields are provided', async () => {
		vi.mocked(authModule.verifySessionUser).mockResolvedValue({
			uid: 'usr_123',
			email: 'student@example.com'
		});

		const request = new Request('http://localhost/api/user', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: 'superadmin', isAdmin: true })
		});

		const response = await PATCH({ request } as unknown as Parameters<typeof PATCH>[0]);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error.code).toBe('BAD_REQUEST');
	});

	it('DELETE /api/user executes user purge and auth deletion', async () => {
		vi.mocked(authModule.verifySessionUser).mockResolvedValue({
			uid: 'usr_123',
			email: 'student@example.com'
		});

		const request = new Request('http://localhost/api/user', {
			method: 'DELETE'
		});

		const response = await DELETE({ request } as unknown as Parameters<typeof DELETE>[0]);
		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json.status).toBe('ok');
		expect(deleteUserModule.purgeAllUserData).toHaveBeenCalledWith('usr_123');
		expect(authModule.invalidateUserSessionCache).toHaveBeenCalledWith('usr_123');
		expect(adminModule.adminAuth.deleteUser).toHaveBeenCalledWith('usr_123');
	});
});
