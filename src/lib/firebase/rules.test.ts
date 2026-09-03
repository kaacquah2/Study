import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
	doc,
	getDoc,
	setDoc,
	updateDoc,
	collection,
	query,
	where,
	getDocs
} from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import fs from 'fs';

let testEnv: RulesTestEnvironment;

async function checkEmulatorAvailable(host: string, port: number): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 1000);
		await fetch(`http://${host}:${port}`, { signal: controller.signal });
		clearTimeout(timeout);
		return true;
	} catch {
		return false;
	}
}

const host = process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1';
const port = parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8085', 10);
const emulatorAvailable = await checkEmulatorAvailable(host, port);

if (!emulatorAvailable) {
	console.warn(
		`[Firestore Rules Tests] Firestore emulator is not running at ${host}:${port}. Skipping security rules tests. ` +
			'To run rules tests, execute: npm run test:rules:emulator'
	);
}

describe.runIf(emulatorAvailable)('Firestore Security Rules', () => {
	beforeAll(async () => {
		testEnv = await initializeTestEnvironment({
			projectId: 'ai-study-buddy-knust',
			firestore: {
				rules: fs.readFileSync('firestore.rules', 'utf8'),
				host,
				port
			}
		});
	});

	afterAll(async () => {
		if (testEnv) {
			await testEnv.cleanup();
		}
	});

	beforeEach(async () => {
		if (testEnv) {
			await testEnv.clearFirestore();
		}
	});

	it('allows owner to read their own profile, but denies others', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// Create user profiles using administrative context
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'users/alice'), {
				uid: 'alice',
				email: 'alice@st.knust.edu.gh',
				theme: 'light',
				streak: { current: 1 }
			});
		});

		// Alice reads Alice (Success)
		const aliceSnap = await getDoc(doc(aliceDb, 'users/alice'));
		expect(aliceSnap.exists()).toBe(true);

		// Bob reads Alice (Failure)
		await expect(getDoc(doc(bobDb, 'users/alice'))).rejects.toThrow();
	});

	it('allows owner to update theme, but denies updating streak (server-authoritative)', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();

		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'users/alice'), {
				uid: 'alice',
				theme: 'light',
				streak: { current: 1 }
			});
		});

		// Alice updates theme (Success)
		await expect(
			updateDoc(doc(aliceDb, 'users/alice'), {
				theme: 'dark'
			})
		).resolves.not.toThrow();

		// Alice updates streak (Failure - rejected by rules)
		await expect(
			updateDoc(doc(aliceDb, 'users/alice'), {
				'streak.current': 5
			})
		).rejects.toThrow();
	});

	it('allows owner to read their course, but denies others and denies client writes', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// Setup course using admin context
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'courses/course1'), {
				id: 'course1',
				ownerUid: 'alice',
				title: 'Intro to AI'
			});
		});

		// Alice reads her course (Success)
		const aliceCourse = await getDoc(doc(aliceDb, 'courses/course1'));
		expect(aliceCourse.exists()).toBe(true);

		// Bob reads Alice course (Failure)
		await expect(getDoc(doc(bobDb, 'courses/course1'))).rejects.toThrow();

		// Alice attempts to write/modify course directly on client (Failure - Admin SDK only)
		await expect(
			setDoc(doc(aliceDb, 'courses/course2'), {
				id: 'course2',
				ownerUid: 'alice',
				title: 'Failing write'
			})
		).rejects.toThrow();
	});

	it('allows owner to read course modules using denormalized ownerUid, but denies others and client writes', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'courses/course1'), {
				id: 'course1',
				ownerUid: 'alice',
				title: 'Intro to AI'
			});
			await setDoc(doc(context.firestore(), 'courses/course1/modules/mod1'), {
				id: 'mod1',
				courseId: 'course1',
				ownerUid: 'alice',
				title: 'Module 1',
				order: 1
			});
		});

		// Alice reads her module directly via denormalized ownerUid (Success without parent get())
		const modSnap = await getDoc(doc(aliceDb, 'courses/course1/modules/mod1'));
		expect(modSnap.exists()).toBe(true);

		// Bob cannot read Alice module (Failure)
		await expect(getDoc(doc(bobDb, 'courses/course1/modules/mod1'))).rejects.toThrow();

		// Direct client writes to modules are blocked (Admin SDK only)
		await expect(
			updateDoc(doc(aliceDb, 'courses/course1/modules/mod1'), {
				title: 'Hacked Title'
			})
		).rejects.toThrow();
	});

	it('allows authenticated users to get unrevoked shared courses, but restricts list to public courses and denies writes', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const unauthDb = testEnv.unauthenticatedContext().firestore();

		// Setup share links in admin context: one private, one public, one revoked
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'sharedCourses/tokenPrivate'), {
				token: 'tokenPrivate',
				isPublic: false,
				revoked: false,
				snapshot: { title: 'Private Shared Course' }
			});
			await setDoc(doc(context.firestore(), 'sharedCourses/tokenPublic'), {
				token: 'tokenPublic',
				isPublic: true,
				revoked: false,
				snapshot: { title: 'Community Public Course' }
			});
			await setDoc(doc(context.firestore(), 'sharedCourses/tokenRevoked'), {
				token: 'tokenRevoked',
				isPublic: true,
				revoked: true,
				snapshot: { title: 'Revoked Course' }
			});
		});

		// 1. Direct get capability on private unrevoked share (Success)
		const privateSnap = await getDoc(doc(aliceDb, 'sharedCourses/tokenPrivate'));
		expect(privateSnap.exists()).toBe(true);

		// 2. Direct get capability on public unrevoked share (Success)
		const publicSnap = await getDoc(doc(aliceDb, 'sharedCourses/tokenPublic'));
		expect(publicSnap.exists()).toBe(true);

		// 3. Direct get on revoked share (Failure)
		await expect(getDoc(doc(aliceDb, 'sharedCourses/tokenRevoked'))).rejects.toThrow();

		// 4. Unauthenticated user get (Failure)
		await expect(getDoc(doc(unauthDb, 'sharedCourses/tokenPublic'))).rejects.toThrow();

		// 5. Query public unrevoked shared courses via collection list (Success)
		const listQuery = query(
			collection(aliceDb, 'sharedCourses'),
			where('isPublic', '==', true),
			where('revoked', '==', false)
		);
		const querySnap = await getDocs(listQuery);
		expect(querySnap.docs.length).toBe(1);
		expect(querySnap.docs[0].id).toBe('tokenPublic');

		// 6. Attempting to enumerate all shared courses (including private ones) without isPublic == true (Failure)
		const leakQuery = query(collection(aliceDb, 'sharedCourses'), where('revoked', '==', false));
		await expect(getDocs(leakQuery)).rejects.toThrow();

		// 7. Alice tries to write share link directly on client (Failure - Admin SDK only)
		await expect(
			setDoc(doc(aliceDb, 'sharedCourses/token2'), {
				token: 'token2',
				isPublic: true,
				revoked: false
			})
		).rejects.toThrow();
	});

	it('enforces ownership, blocks client creation, and protects FSRS scheduling fields on flashcards', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// Setup flashcard via Admin context with authoritative FSRS engine parameters
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'flashcards/card1'), {
				id: 'card1',
				uid: 'alice',
				front: 'What is FSRS?',
				back: 'Free Spaced Repetition Scheduler',
				engine: 'fsrs',
				stability: 2.5,
				difficulty: 4.2,
				reps: 3,
				lapses: 0,
				state: 'Review',
				dueDate: '2026-09-10',
				tags: ['ai', 'learning']
			});
		});

		// 1. Direct client creation is blocked (creation is Admin SDK only via /api/spaced-repetition)
		await expect(
			setDoc(doc(aliceDb, 'flashcards/card2'), {
				id: 'card2',
				uid: 'alice',
				front: 'Direct write',
				back: 'Should fail'
			})
		).rejects.toThrow();

		// 2. Owner can read their flashcard
		const aliceSnap = await getDoc(doc(aliceDb, 'flashcards/card1'));
		expect(aliceSnap.exists()).toBe(true);

		// 3. Bob cannot read Alice card (Failure)
		await expect(getDoc(doc(bobDb, 'flashcards/card1'))).rejects.toThrow();

		// 4. Alice can update allowed content fields (front, back, tags, updatedAt)
		await expect(
			updateDoc(doc(aliceDb, 'flashcards/card1'), {
				front: 'What is FSRS-4.5?',
				back: 'Updated description',
				tags: ['fsrs', 'spaced-repetition'],
				updatedAt: '2026-09-03T12:00:00Z'
			})
		).resolves.not.toThrow();

		// 5. Alice CANNOT tamper with FSRS scheduling parameters directly on the client
		await expect(
			updateDoc(doc(aliceDb, 'flashcards/card1'), {
				stability: 999.0
			})
		).rejects.toThrow();

		await expect(
			updateDoc(doc(aliceDb, 'flashcards/card1'), {
				dueDate: '2099-01-01'
			})
		).rejects.toThrow();
	});

	it('enforces membership access for studyGroups and restricts client writes', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'studyGroups/group1'), {
				id: 'group1',
				name: 'KNUST CS Study Group',
				memberUids: ['alice']
			});
		});

		// Alice (member) reads group (Success)
		const groupSnap = await getDoc(doc(aliceDb, 'studyGroups/group1'));
		expect(groupSnap.exists()).toBe(true);

		// Bob (non-member) reads group (Failure)
		await expect(getDoc(doc(bobDb, 'studyGroups/group1'))).rejects.toThrow();

		// Alice attempts client write (Failure - Admin SDK only)
		await expect(
			updateDoc(doc(aliceDb, 'studyGroups/group1'), {
				name: 'Hacked Group Name'
			})
		).rejects.toThrow();
	});

	it('handles peerQuestions lifecycle security (blocks direct client creation, permits owner & approved reads)', async () => {
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// 1. Direct client submission is blocked (must use /api/courses/peer-questions for moderation & rate-limits)
		await expect(
			setDoc(doc(aliceDb, 'peerQuestions/q1'), {
				id: 'q1',
				courseId: 'c1',
				submittedBy: 'alice',
				status: 'pending',
				question: 'Direct client submission'
			})
		).rejects.toThrow();

		// 2. Setup pending question via server/Admin context
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'peerQuestions/q1'), {
				id: 'q1',
				courseId: 'c1',
				submittedBy: 'alice',
				status: 'pending',
				question: 'What is SM-2?'
			});
		});

		// 3. Submitter (Alice) can read her own pending question
		const alicePendingSnap = await getDoc(doc(aliceDb, 'peerQuestions/q1'));
		expect(alicePendingSnap.exists()).toBe(true);

		// 4. Bob cannot read Alice pending question (Failure)
		await expect(getDoc(doc(bobDb, 'peerQuestions/q1'))).rejects.toThrow();

		// 5. Admin approves question
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await updateDoc(doc(context.firestore(), 'peerQuestions/q1'), {
				status: 'approved'
			});
		});

		// 6. Bob can read approved question (Success)
		const approvedSnap = await getDoc(doc(bobDb, 'peerQuestions/q1'));
		expect(approvedSnap.exists()).toBe(true);
	});
});
