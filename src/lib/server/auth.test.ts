import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySessionUser, clearL1UserCache, invalidateUserSessionCache } from './auth';
import { adminAuth, adminDb } from './admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { CollectionReference } from 'firebase-admin/firestore';

vi.mock('./admin', () => {
	const mockGet = vi.fn();
	const mockSet = vi.fn();
	const mockDoc = vi.fn(() => ({
		get: mockGet,
		set: mockSet
	}));
	const mockCollection = vi.fn(() => ({
		doc: mockDoc
	}));

	return {
		adminAuth: {
			verifyIdToken: vi.fn()
		},
		adminDb: {
			collection: mockCollection
		},
		FieldValue: {
			serverTimestamp: () => 'MOCK_TIMESTAMP'
		}
	};
});

vi.mock('./redis', () => ({
	isRedisConfigured: () => false,
	redisGet: vi.fn().mockResolvedValue(null),
	redisSet: vi.fn().mockResolvedValue(true),
	redisDel: vi.fn().mockResolvedValue(true),
	redisPublish: vi.fn().mockResolvedValue(1)
}));

describe('verifySessionUser Unit Tests', () => {
	const mockUserDoc = { exists: true, data: () => ({ uid: 'user123', isBanned: false }) };

	beforeEach(() => {
		vi.clearAllMocks();
		clearL1UserCache();
	});

	it('uses L1 in-memory cache for subsequent requests to avoid redundant Firestore reads', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'cached_user',
			email: 'cached@knust.edu.gh'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi
				.fn()
				.mockResolvedValue({ exists: true, data: () => ({ uid: 'cached_user', isBanned: false }) }),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		// First call: hits Firestore
		const user1 = await verifySessionUser(req);
		expect(user1.uid).toBe('cached_user');
		expect(mockDocRef.get).toHaveBeenCalledTimes(1);

		// Second call: served from L1 cache (zero additional Firestore reads)
		const user2 = await verifySessionUser(req);
		expect(user2.uid).toBe('cached_user');
		expect(mockDocRef.get).toHaveBeenCalledTimes(1);
	});

	it('throws error if Authorization header is missing', async () => {
		const req = new Request('http://localhost/api/test');
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: Missing or malformed Authorization header'
		);
	});

	it('throws error if Authorization header does not use Bearer scheme', async () => {
		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Basic token123' }
		});
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: Missing or malformed Authorization header'
		);
	});

	it('throws error if token verification fails', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('Token expired'));

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer invalid-token' }
		});
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: Invalid ID token - Token expired'
		);
	});

	it('returns user details if token is valid and user profile exists', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'user123',
			email: 'student@knust.edu.gh',
			name: 'Test Student'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockResolvedValue(mockUserDoc),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		const user = await verifySessionUser(req);

		expect(user).toEqual({
			uid: 'user123',
			email: 'student@knust.edu.gh',
			name: 'Test Student'
		});
		expect(mockDocRef.set).not.toHaveBeenCalled();
	});

	it('throws error when user is banned and includes suspension reason', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'banned_user',
			email: 'banned@knust.edu.gh'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockResolvedValue({
				exists: true,
				data: () => ({
					uid: 'banned_user',
					isBanned: true,
					bannedReason: 'Terms of service violation'
				})
			}),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		// First call: hits Firestore and throws ban error
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: User account is suspended: Terms of service violation'
		);
		expect(mockDocRef.get).toHaveBeenCalledTimes(1);

		// Second call: served from L1 cache (zero additional Firestore reads) and still throws ban error
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: User account is suspended: Terms of service violation'
		);
		expect(mockDocRef.get).toHaveBeenCalledTimes(1);
	});

	it('invalidates user session cache so updated ban state takes effect immediately', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'toggle_user',
			email: 'toggle@knust.edu.gh'
		} as unknown as DecodedIdToken);

		let isBanned = true;
		const mockDocRef = {
			get: vi.fn().mockImplementation(async () => ({
				exists: true,
				data: () => ({
					uid: 'toggle_user',
					isBanned,
					bannedReason: isBanned ? 'Temporary lock' : null
				})
			})),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		// 1. Initial banned call
		await expect(verifySessionUser(req)).rejects.toThrow(
			'Unauthorized: User account is suspended: Temporary lock'
		);
		expect(mockDocRef.get).toHaveBeenCalledTimes(1);

		// 2. Unban user in database
		isBanned = false;

		// 3. Actively invalidate cache
		await invalidateUserSessionCache('toggle_user');

		// 4. Next call should re-fetch from database and succeed
		const user = await verifySessionUser(req);
		expect(user.uid).toBe('toggle_user');
		expect(mockDocRef.get).toHaveBeenCalledTimes(2);
	});

	it('initializes default user profile doc with isBanned: false if user profile does not exist', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'newuser',
			email: 'new@knust.edu.gh',
			name: 'New User',
			picture: 'https://example.com/pic.png'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockResolvedValue({ exists: false }),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		const user = await verifySessionUser(req);

		expect(user.uid).toBe('newuser');
		expect(mockDocRef.set).toHaveBeenCalledWith({
			uid: 'newuser',
			email: 'new@knust.edu.gh',
			displayName: 'New User',
			photoURL: 'https://example.com/pic.png',
			theme: 'light',
			isBanned: false,
			streak: {
				current: 0,
				longest: 0,
				lastStudiedOn: null,
				timezone: 'Africa/Accra'
			},
			createdAt: 'MOCK_TIMESTAMP'
		});
	});

	it('uses custom headers for timezone and theme when initializing profile', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'customuser',
			email: 'custom@knust.edu.gh'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockResolvedValue({ exists: false }),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: {
				Authorization: 'Bearer valid-token',
				'X-Client-Timezone': 'Europe/London',
				'X-Client-Theme': 'dark'
			}
		});

		await verifySessionUser(req);

		expect(mockDocRef.set).toHaveBeenCalledWith(
			expect.objectContaining({
				theme: 'dark',
				streak: expect.objectContaining({
					timezone: 'Europe/London'
				})
			})
		);
	});

	it('falls back to default timezone if client provided invalid timezone string', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'user_bad_tz'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockResolvedValue({ exists: false }),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: {
				Authorization: 'Bearer valid-token',
				'X-Client-Timezone': 'Invalid/Timezone_Name',
				'X-Client-Theme': 'invalid_theme'
			}
		});

		await verifySessionUser(req);

		expect(mockDocRef.set).toHaveBeenCalledWith(
			expect.objectContaining({
				theme: 'light',
				streak: expect.objectContaining({
					timezone: 'Africa/Accra'
				})
			})
		);
	});

	it('throws error loudly if Firestore profile creation fails after retries', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'user_failed_db'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi.fn().mockRejectedValue(new Error('Firestore connection lost')),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		await expect(verifySessionUser(req)).rejects.toThrow(
			'Firestore user profile initialization failed: Firestore connection lost'
		);
		expect(mockDocRef.get).toHaveBeenCalledTimes(3);
	});

	it('retries Firestore profile fetch/creation and succeeds if subsequent attempt succeeds', async () => {
		vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
			uid: 'user_retry_db'
		} as unknown as DecodedIdToken);

		const mockDocRef = {
			get: vi
				.fn()
				.mockRejectedValueOnce(new Error('Transient error'))
				.mockResolvedValueOnce({
					exists: true,
					data: () => ({ uid: 'user_retry_db', isBanned: false })
				}),
			set: vi.fn().mockResolvedValue(undefined)
		};
		vi.mocked(adminDb.collection).mockReturnValue({
			doc: () => mockDocRef
		} as unknown as CollectionReference);

		const req = new Request('http://localhost/api/test', {
			headers: { Authorization: 'Bearer valid-token' }
		});

		const user = await verifySessionUser(req);
		expect(user.uid).toBe('user_retry_db');
		expect(mockDocRef.get).toHaveBeenCalledTimes(2);
	});
});
