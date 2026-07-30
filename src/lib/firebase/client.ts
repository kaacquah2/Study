import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_APP_ID
} from '$env/static/public';

const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to local emulators only when explicitly enabled (e.g. PUBLIC_FIREBASE_USE_EMULATOR=true)
const useEmulator = import.meta.env.PUBLIC_FIREBASE_USE_EMULATOR === 'true';
if (import.meta.env.DEV && useEmulator) {
	const isEmulated = (auth as unknown as { _emulatorConfig?: unknown })._emulatorConfig;
	if (!isEmulated) {
		connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
		connectFirestoreEmulator(db, 'localhost', 8085);
	}
}

export { app, auth, db };
export default app;
