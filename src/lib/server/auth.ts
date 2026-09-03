import { adminDb, adminAuth, FieldValue } from './admin';
import { redisGet, redisSet, redisDel, isRedisConfigured } from './redis';

export interface AuthenticatedUser {
	uid: string;
	email?: string;
	name?: string | null;
}

export interface UserCacheData {
	exists: boolean;
	isBanned: boolean;
	bannedReason?: string | null;
}

interface CacheEntry extends UserCacheData {
	expiresAt: number;
}

// Bounded L1 in-memory LRU cache to prevent memory leaks and permanent drift
const L1_USER_CACHE = new Map<string, CacheEntry>();
const L1_TTL_MS = 15 * 60 * 1000; // 15 minutes bounded TTL
const MAX_L1_ENTRIES = 5000;

function getL1(uid: string): UserCacheData | null {
	const entry = L1_USER_CACHE.get(uid);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		L1_USER_CACHE.delete(uid);
		return null;
	}
	// Refresh LRU insertion order on access
	L1_USER_CACHE.delete(uid);
	L1_USER_CACHE.set(uid, entry);
	return {
		exists: entry.exists,
		isBanned: entry.isBanned,
		bannedReason: entry.bannedReason
	};
}

function setL1(uid: string, data: UserCacheData): void {
	if (L1_USER_CACHE.has(uid)) {
		L1_USER_CACHE.delete(uid);
	} else if (L1_USER_CACHE.size >= MAX_L1_ENTRIES) {
		// Explicit oldest LRU key eviction
		const oldestKey = L1_USER_CACHE.keys().next().value;
		if (oldestKey) L1_USER_CACHE.delete(oldestKey);
	}
	L1_USER_CACHE.set(uid, { ...data, expiresAt: Date.now() + L1_TTL_MS });
}

export function clearL1UserCache(): void {
	L1_USER_CACHE.clear();
}

/**
 * Actively invalidates both L1 and L2 user existence/session caches (e.g. on user ban, unban, or account deletion).
 */
export async function invalidateUserSessionCache(uid: string): Promise<void> {
	L1_USER_CACHE.delete(uid);
	if (isRedisConfigured()) {
		await redisDel(`user:state:${uid}`);
		await redisDel(`user:exists:${uid}`);
	}
}

function isValidTimezone(tz: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/**
 * Extracts and verifies the Firebase ID token from the request Authorization header.
 * Uses bounded L1 LRU and L2 Redis state caching to enforce ban states and bypass redundant Firestore reads.
 * Automatically initializes the user document in Firestore if it doesn't exist.
 * Throws an error if authentication fails or user is banned.
 */
export async function verifySessionUser(request: Request): Promise<AuthenticatedUser> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new Error('Unauthorized: Missing or malformed Authorization header');
	}

	const idToken = authHeader.substring(7); // Remove 'Bearer '
	let decodedToken;
	try {
		decodedToken = await adminAuth.verifyIdToken(idToken);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Unauthorized: Invalid ID token - ${message}`, { cause: error });
	}

	const uid = decodedToken.uid;

	// 1. Fast L1 Memory Check
	const l1Status = getL1(uid);
	if (l1Status) {
		if (l1Status.isBanned) {
			throw new Error(
				`Unauthorized: User account is suspended${l1Status.bannedReason ? `: ${l1Status.bannedReason}` : ''}`
			);
		}
		return {
			uid,
			email: decodedToken.email,
			name: decodedToken.name || null
		};
	}

	// 2. Fast L2 Redis Check
	const redisKey = `user:state:${uid}`;
	if (isRedisConfigured()) {
		const cachedState = await redisGet<UserCacheData>(redisKey);
		if (cachedState && cachedState.exists) {
			setL1(uid, cachedState);
			if (cachedState.isBanned) {
				throw new Error(
					`Unauthorized: User account is suspended${cachedState.bannedReason ? `: ${cachedState.bannedReason}` : ''}`
				);
			}
			return {
				uid,
				email: decodedToken.email,
				name: decodedToken.name || null
			};
		}
	}

	// 3. Fallback: Query Firestore & Initialize if missing
	// Retries up to 3 times on transient failures and throws loudly if profile creation/retrieval fails.
	const maxRetries = 3;
	let lastDbError: unknown = null;
	let profileInitialized = false;
	let userCacheData: UserCacheData | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const userDocRef = adminDb.collection('users').doc(uid);
			const userDoc = await userDocRef.get();

			if (!userDoc.exists) {
				const clientTzHeader = request.headers.get('X-Client-Timezone');
				const clientThemeHeader = request.headers.get('X-Client-Theme');
				const tz =
					clientTzHeader && isValidTimezone(clientTzHeader) ? clientTzHeader : 'Africa/Accra';
				const theme =
					clientThemeHeader && ['light', 'dark'].includes(clientThemeHeader)
						? clientThemeHeader
						: 'light';

				await userDocRef.set({
					uid,
					email: decodedToken.email || '',
					displayName: decodedToken.name || null,
					photoURL: decodedToken.picture || null,
					theme: theme,
					isBanned: false,
					streak: {
						current: 0,
						longest: 0,
						lastStudiedOn: null,
						timezone: tz,
						freezesAvailable: 1,
						lastFreezeRefill: null
					},
					createdAt: FieldValue.serverTimestamp()
				});
				userCacheData = { exists: true, isBanned: false };
			} else {
				const userData = userDoc.data();
				userCacheData = {
					exists: true,
					isBanned: userData?.isBanned === true,
					bannedReason: userData?.bannedReason || null
				};
			}
			profileInitialized = true;
			break;
		} catch (dbError) {
			lastDbError = dbError;
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
			}
		}
	}

	if (!profileInitialized || !userCacheData) {
		const message = lastDbError instanceof Error ? lastDbError.message : String(lastDbError);
		throw new Error(`Firestore user profile initialization failed: ${message}`, {
			cause: lastDbError
		});
	}

	// Cache user state in L2 Redis (24h TTL) and L1 Memory
	if (isRedisConfigured()) {
		await redisSet(redisKey, userCacheData, 86400);
	}
	setL1(uid, userCacheData);

	if (userCacheData.isBanned) {
		throw new Error(
			`Unauthorized: User account is suspended${userCacheData.bannedReason ? `: ${userCacheData.bannedReason}` : ''}`
		);
	}

	return {
		uid,
		email: decodedToken.email,
		name: decodedToken.name || null
	};
}
