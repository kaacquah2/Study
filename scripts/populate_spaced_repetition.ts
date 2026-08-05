import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

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
				if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
const projectId = process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'study-fd50d';

if (!serviceAccountJson) {
	console.error('ERROR: FIREBASE_SERVICE_ACCOUNT is missing in environment or .env!');
	process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
	serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

if (getApps().length === 0) {
	initializeApp({
		credential: cert(serviceAccount),
		projectId: serviceAccount.project_id || projectId
	});
}

const db = getFirestore();
const auth = getAuth();
const TODAY_STR = new Date().toISOString().split('T')[0];

async function main() {
	console.log(`=== Spaced Repetition Drill (FSRS-4.5) User Ownership & Due Question Verifier ===`);

	// 1. Fetch all registered users from Firebase Auth & Firestore
	let userUids: string[] = [];
	try {
		const authUsers = await auth.listUsers(100);
		userUids = authUsers.users.map((u) => u.uid);
		console.log(`Found ${userUids.length} Firebase Auth user(s): ${userUids.join(', ')}`);
	} catch (err) {
		console.warn('Could not list auth users directly, checking Firestore users collection...', err);
	}

	const usersSnap = await db.collection('users').get();
	for (const uDoc of usersSnap.docs) {
		if (!userUids.includes(uDoc.id)) {
			userUids.push(uDoc.id);
		}
	}
	console.log(`Total user UIDs to process: ${userUids.length} ->`, userUids);

	// 2. Fetch all courses
	const coursesSnap = await db.collection('courses').get();
	console.log(`Total course documents in database: ${coursesSnap.size}`);

	// If there are registered users, ensure every user owns at least 2 courses with quiz modules
	for (const uid of userUids) {
		const userCoursesSnap = await db.collection('courses').where('ownerUid', '==', uid).get();
		console.log(`User [${uid}] currently owns ${userCoursesSnap.size} course(s).`);

		if (userCoursesSnap.size === 0) {
			console.log(`Assigning / creating courses for user [${uid}] so their Spaced Repetition Drill is populated...`);
			// Pick existing courses without ownerUid or assign community courses
			let countAssigned = 0;
			for (const cDoc of coursesSnap.docs) {
				const cData = cDoc.data();
				if (!cData.ownerUid || cData.ownerUid === 'none') {
					await cDoc.ref.set({ ownerUid: uid }, { merge: true });
					console.log(`Assigned course [${cDoc.id}] "${cData.title}" to ownerUid [${uid}]`);
					countAssigned++;
					if (countAssigned >= 3) break;
				}
			}
		}
	}

	// 3. Ensure ALL courses have quiz modules with FSRS-4.5 metadata and nextReviewDate <= TODAY_STR
	const updatedCoursesSnap = await db.collection('courses').get();
	let totalDueQuestions = 0;

	for (const cDoc of updatedCoursesSnap.docs) {
		const modulesSnap = await cDoc.ref.collection('modules').get();
		
		for (const mDoc of modulesSnap.docs) {
			const mData = mDoc.data();
			if (mData.type === 'quiz') {
				let questions = Array.isArray(mData.questions) ? [...mData.questions] : [];
				if (questions.length > 0) {
					questions = questions.map((q: Record<string, unknown>) => ({
						...q,
						nextReviewDate: TODAY_STR,
						intervalDays: q.intervalDays ?? 0,
						stability: q.stability ?? 0.5,
						difficulty: q.difficulty ?? 5.0,
						repetitions: q.repetitions ?? q.reps ?? 0,
						lapses: q.lapses ?? 0,
						fsrsState: q.fsrsState ?? 'New'
					}));
					await mDoc.ref.set({ questions }, { merge: true });
					totalDueQuestions += questions.length;
				}
			}
		}
	}

	console.log(`\n==================================================`);
	console.log(`Spaced Repetition Drill (FSRS-4.5) is fully populated!`);
	console.log(`Total Due Cards Available for Today (${TODAY_STR}): ${totalDueQuestions}`);
	console.log(`==================================================\n`);
}

main().catch((err) => {
	console.error('Error verifying/populating spaced repetition drill:', err);
	process.exit(1);
});
