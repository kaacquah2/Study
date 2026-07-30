import { adminDb, adminAuth, FieldValue } from './admin';

export interface AuthenticatedUser {
	uid: string;
	email?: string;
	name?: string | null;
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
 * Automatically initializes the user document in Firestore if it doesn't exist.
 * Throws an error if authentication fails.
 */
export async function verifySessionUser(request: Request): Promise<AuthenticatedUser> {
	const internalKey = request.headers.get('X-Internal-Service-Key');
	const internalUid = request.headers.get('X-Internal-User-UID');
	const expectedKey = process.env.ML_BACKEND_API_KEY || '';

	if (internalKey && expectedKey && internalKey === expectedKey && internalUid) {
		return {
			uid: internalUid,
			email: request.headers.get('X-Internal-User-Email') || 'internal@service.local',
			name: 'Internal System'
		};
	}

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

	// Initialize user profile document in Firestore if it does not exist.
	// Retries up to 3 times on transient failures and throws loudly if profile creation/retrieval fails.
	const maxRetries = 3;
	let lastDbError: unknown = null;
	let profileInitialized = false;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const userDocRef = adminDb.collection('users').doc(decodedToken.uid);
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
					uid: decodedToken.uid,
					email: decodedToken.email || '',
					displayName: decodedToken.name || null,
					photoURL: decodedToken.picture || null,
					theme: theme,
					streak: {
						current: 0,
						longest: 0,
						lastStudiedOn: null,
						timezone: tz
					},
					createdAt: FieldValue.serverTimestamp()
				});
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

	if (!profileInitialized) {
		const message = lastDbError instanceof Error ? lastDbError.message : String(lastDbError);
		throw new Error(`Firestore user profile initialization failed: ${message}`, {
			cause: lastDbError
		});
	}

	return {
		uid: decodedToken.uid,
		email: decodedToken.email,
		name: decodedToken.name || null
	};
}
