import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authModule from '$lib/server/auth';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockGet = vi.fn();
	const mockSet = vi.fn();
	const mockDoc = vi.fn(() => ({ get: mockGet, set: mockSet }));
	const mockCollection = vi.fn(() => ({ doc: mockDoc }));
	return {
		adminDb: { collection: mockCollection },
		FieldValue: { serverTimestamp: vi.fn() }
	};
});

describe('Course Share & Claim API logic', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should verify user authentication before creating a share token', async () => {
		const fakeUser = { uid: 'owner_123', email: 'owner@example.com' };
		vi.mocked(authModule.verifySessionUser).mockResolvedValue(fakeUser);

		const req = new Request('http://localhost/api/courses/course_1/share', {
			method: 'POST',
			headers: { Authorization: 'Bearer valid_token' }
		});

		const user = await authModule.verifySessionUser(req);
		expect(user.uid).toBe('owner_123');
	});

	it('should reject unauthenticated user attempting to create share token', async () => {
		vi.mocked(authModule.verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

		const req = new Request('http://localhost/api/courses/course_1/share', {
			method: 'POST'
		});

		await expect(authModule.verifySessionUser(req)).rejects.toThrow('Unauthorized');
	});
});
