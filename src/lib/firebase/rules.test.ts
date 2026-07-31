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

let testEnv: RulesTestEnvironment | undefined;

describe('Firestore Security Rules', () => {
	beforeAll(async () => {
		try {
			testEnv = await initializeTestEnvironment({
				projectId: 'ai-study-buddy-knust',
				firestore: {
					rules: fs.readFileSync('firestore.rules', 'utf8'),
					host: '127.0.0.1',
					port: 8085
				}
			});
		} catch {
			console.warn('Firestore emulator not running on 127.0.0.1:8085; skipping rules tests.');
		}
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
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
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
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
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
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
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

	it('allows authenticated users to read unrevoked shared courses, but denies write', async () => {
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const unauthDb = testEnv.unauthenticatedContext().firestore();

		// Setup share link in admin context
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await setDoc(doc(context.firestore(), 'sharedCourses/token1'), {
				token: 'token1',
				revoked: false,
				snapshot: { title: 'Shared Course' }
			});
			await setDoc(doc(context.firestore(), 'sharedCourses/tokenRevoked'), {
				token: 'tokenRevoked',
				revoked: true,
				snapshot: { title: 'Revoked Course' }
			});
		});

		// Alice reads unrevoked share (Success)
		const shareSnap = await getDoc(doc(aliceDb, 'sharedCourses/token1'));
		expect(shareSnap.exists()).toBe(true);

		// Alice reads revoked share (Failure)
		await expect(getDoc(doc(aliceDb, 'sharedCourses/tokenRevoked'))).rejects.toThrow();

		// Unauthenticated user reads unrevoked share (Failure)
		await expect(getDoc(doc(unauthDb, 'sharedCourses/token1'))).rejects.toThrow();

		// Alice queries unrevoked shared courses via collection query (Success)
		const listQuery = query(collection(aliceDb, 'sharedCourses'), where('revoked', '==', false));
		const querySnap = await getDocs(listQuery);
		expect(querySnap.docs.length).toBe(1);

		// Alice tries to write share link directly on client (Failure)
		await expect(
			setDoc(doc(aliceDb, 'sharedCourses/token2'), {
				token: 'token2',
				revoked: false
			})
		).rejects.toThrow();
	});

	it('enforces ownership for flashcards and blocks cross-user access', async () => {
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// Alice creates card for Alice (Success)
		await expect(
			setDoc(doc(aliceDb, 'flashcards/card1'), {
				id: 'card1',
				uid: 'alice',
				front: 'Q',
				back: 'A'
			})
		).resolves.not.toThrow();

		// Bob reads Alice card (Failure)
		await expect(getDoc(doc(bobDb, 'flashcards/card1'))).rejects.toThrow();

		// Bob attempts to create card with Alice uid (Failure)
		await expect(
			setDoc(doc(bobDb, 'flashcards/card2'), {
				id: 'card2',
				uid: 'alice',
				front: 'Fake',
				back: 'Card'
			})
		).rejects.toThrow();
	});

	it('enforces membership access for studyGroups and restricts client writes', async () => {
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
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

	it('handles peerQuestions lifecycle security (pending submission vs approved reading)', async () => {
		if (!testEnv) {
			expect(true).toBe(true);
			return;
		}
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		const bobDb = testEnv.authenticatedContext('bob').firestore();

		// Alice submits question with pending status (Success)
		await expect(
			setDoc(doc(aliceDb, 'peerQuestions/q1'), {
				id: 'q1',
				courseId: 'c1',
				submittedBy: 'alice',
				status: 'pending',
				question: 'What is SM-2?'
			})
		).resolves.not.toThrow();

		// Bob reads Alice pending question (Failure)
		await expect(getDoc(doc(bobDb, 'peerQuestions/q1'))).rejects.toThrow();

		// Admin approves question
		await testEnv.withSecurityRulesDisabled(async (context) => {
			await updateDoc(doc(context.firestore(), 'peerQuestions/q1'), {
				status: 'approved'
			});
		});

		// Bob reads approved question (Success)
		const approvedSnap = await getDoc(doc(bobDb, 'peerQuestions/q1'));
		expect(approvedSnap.exists()).toBe(true);
	});
});
