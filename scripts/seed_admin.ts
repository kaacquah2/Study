import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env file manually if process.env is not populated
function loadEnv() {
	const envPath = path.join(process.cwd(), '.env');
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, 'utf-8');
		for (const line of envContent.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eqIdx = trimmed.indexOf('=');
			if (eqIdx !== -1) {
				const key = trimmed.slice(0, eqIdx).trim();
				let val = trimmed.slice(eqIdx + 1).trim();
				if (
					(val.startsWith('"') && val.endsWith('"')) ||
					(val.startsWith("'") && val.endsWith("'"))
				) {
					val = val.slice(1, -1);
				}
				if (!process.env[key]) {
					process.env[key] = val;
				}
			}
		}
	}
}

loadEnv();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const projectId =
	process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'study-fd50d';

if (!serviceAccountJson) {
	console.error('❌ ERROR: FIREBASE_SERVICE_ACCOUNT is missing in environment or .env!');
	process.exit(1);
}

let serviceAccount;
try {
	serviceAccount = JSON.parse(serviceAccountJson);
	if (serviceAccount.private_key) {
		serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
	}
} catch (e) {
	console.error('❌ ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({
		credential: cert(serviceAccount),
		projectId: serviceAccount.project_id || projectId
	});
}

const db = getFirestore();
const auth = getAuth();

// Parse command line arguments
// Usage: node --experimental-strip-types scripts/seed_admin.ts [email] [--role=admin|superadmin] [--password=secret]
const args = process.argv.slice(2);
let targetEmail = '';
let targetPassword = '';

for (const arg of args) {
	if (arg.startsWith('--password=')) {
		targetPassword = arg.split('=')[1];
	} else if (!arg.startsWith('--') && !targetEmail) {
		targetEmail = arg.trim();
	}
}

if (!targetEmail) {
	targetEmail = process.env.ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || '';
}

if (!targetEmail) {
	console.error('\nUsage:');
	console.error('  npm run seed:admin <email> [--password=yourpassword]\n');
	console.error('Example:');
	console.error('  npm run seed:admin admin@example.com\n');
	console.error('Or set ADMIN_EMAIL=your-email@example.com in your .env file.\n');
	process.exit(1);
}

async function seedAdmin() {
	console.log(`\n🔍 Looking up user: ${targetEmail}...`);

	let firebaseUser;
	let isNewUser = false;

	try {
		firebaseUser = await auth.getUserByEmail(targetEmail);
		console.log(`✅ Found existing Firebase Auth user: ${firebaseUser.uid}`);
		if (targetPassword) {
			await auth.updateUser(firebaseUser.uid, { password: targetPassword });
			console.log(`🔑 Successfully updated password for existing user in Firebase Auth.`);
		}
	} catch (error: unknown) {
		const err = error as { code?: string };
		if (err.code === 'auth/user-not-found') {
			const initialPassword = targetPassword || 'AdminPass123!';
			console.log(`ℹ️  User not found in Firebase Auth. Creating new user...`);
			firebaseUser = await auth.createUser({
				email: targetEmail,
				password: initialPassword,
				displayName: targetEmail.split('@')[0],
				emailVerified: true
			});
			isNewUser = true;
			console.log(`✅ Created new Firebase Auth user with UID: ${firebaseUser.uid}`);
			console.log(`🔑 Temporary Password: ${initialPassword}`);
		} else {
			console.error('❌ Failed to fetch user from Firebase Auth:', error);
			process.exit(1);
		}
	}

	const uid = firebaseUser.uid;

	// 1. Set Firebase Auth Custom Claims (full admin privileges)
	console.log(`⚙️  Applying Administrator custom claims...`);
	await auth.setCustomUserClaims(uid, {
		role: 'admin',
		admin: true,
		superadmin: true
	});

	// 2. Update Firestore users/{uid} document
	console.log(`💾 Updating Firestore profile (users/${uid})...`);
	const userDocRef = db.collection('users').doc(uid);
	const userDoc = await userDocRef.get();

	if (userDoc.exists) {
		await userDocRef.update({
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: true,
			updatedAt: FieldValue.serverTimestamp()
		});
	} else {
		await userDocRef.set({
			uid,
			email: targetEmail,
			displayName: firebaseUser.displayName || targetEmail.split('@')[0],
			photoURL: firebaseUser.photoURL || null,
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: true,
			isBanned: false,
			theme: 'light',
			streak: {
				current: 0,
				longest: 0,
				lastStudiedOn: null,
				timezone: 'UTC',
				freezesAvailable: 1,
				lastFreezeRefill: null
			},
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
	}

	console.log('\n======================================================');
	console.log(`🎉 SUCCESS: User promoted to ADMINISTRATOR!`);
	console.log(`   Email: ${targetEmail}`);
	console.log(`   UID:   ${uid}`);
	console.log(`   Role:  admin (Full root privileges)`);
	if (isNewUser) {
		console.log(`   Password: ${targetPassword || 'AdminPass123!'}`);
	}
	console.log('======================================================');
	console.log('\nHow to access:');
	console.log('1. Log in to the application at http://localhost:5173/');
	console.log('2. If you are already logged in on the browser, refresh or re-sign in to refresh auth claims.');
	console.log('3. Access the unified Admin Console:');
	console.log('   - Admin Console:     http://localhost:5173/app/admin');
	console.log('   - User Management:   http://localhost:5173/superadmin/user-management');
	console.log('\n');
}

seedAdmin().catch((err) => {
	console.error('❌ Error seeding admin account:', err);
	process.exit(1);
});
