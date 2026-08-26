import { initializeApp, getApps, deleteApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { PUBLIC_FIREBASE_PROJECT_ID } from '$env/static/public';
import { env } from '$env/dynamic/private';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId =
	PUBLIC_FIREBASE_PROJECT_ID ||
	process.env.PUBLIC_FIREBASE_PROJECT_ID ||
	process.env.FIREBASE_PROJECT_ID ||
	'study-fd50d';

// Ensure Google Auth / Firebase Admin SDK can resolve project ID in local environment
if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = projectId;
if (!process.env.GCP_PROJECT) process.env.GCP_PROJECT = projectId;
if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = projectId;

function initAdmin(): App {
	// Delete any previously initialized app.
	// This is critical for Vite HMR: when this module is reloaded, the Firebase Admin
	// SDK's global app registry still holds the old (possibly unauthenticated) app.
	// We delete it so initializeApp() uses the latest credentials from .env.
	const existingApps = getApps();
	for (const a of existingApps) {
		deleteApp(a).catch(() => {}); // fire-and-forget; sync deletion not needed
	}

	if (emulatorHost) {
		return initializeApp({ projectId });
	}

	const serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;

	if (!serviceAccountJson) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error(
				'[FATAL SECURITY CONFIG] FIREBASE_SERVICE_ACCOUNT is required in production environment.'
			);
		}
		console.warn('[admin.ts] No FIREBASE_SERVICE_ACCOUNT found — initializing without credentials');
		return initializeApp({ projectId });
	}

	try {
		const serviceAccount = JSON.parse(serviceAccountJson);
		if (serviceAccount.private_key) {
			serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
		}
		const app = initializeApp({
			credential: cert(serviceAccount),
			projectId: serviceAccount.project_id || projectId
		});
		return app;
	} catch (e) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error(`[FATAL SECURITY CONFIG] Failed to parse FIREBASE_SERVICE_ACCOUNT: ${e}`, {
				cause: e
			});
		}
		console.error('[admin.ts] Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
		return initializeApp({ projectId });
	}
}

const app = initAdmin();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export { FieldValue };
