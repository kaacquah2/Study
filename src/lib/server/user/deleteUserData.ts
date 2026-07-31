import { adminDb, FieldValue } from '$lib/server/admin';

/**
 * Purges all Firestore documents and subcollections associated with a given user.
 * Implements GDPR/CCPA Right to Be Forgotten.
 */
export async function purgeAllUserData(uid: string): Promise<void> {
	// 1. Purge subcollections of `users/{uid}` (e.g., progress)
	const userRef = adminDb.collection('users').doc(uid);
	const progressSnap = await userRef.collection('progress').get();
	if (!progressSnap.empty) {
		const batch = adminDb.batch();
		progressSnap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
	}

	// 2. Delete user's courses and module subcollections
	const coursesSnap = await adminDb.collection('courses').where('ownerUid', '==', uid).get();
	for (const courseDoc of coursesSnap.docs) {
		const modulesSnap = await courseDoc.ref.collection('modules').get();
		if (!modulesSnap.empty) {
			const batch = adminDb.batch();
			modulesSnap.docs.forEach((modDoc) => batch.delete(modDoc.ref));
			await batch.commit();
		}
		await courseDoc.ref.delete();
	}

	// 3. Delete user's quiz attempts
	const attemptsSnap = await adminDb.collection('quizAttempts').where('userId', '==', uid).get();
	if (!attemptsSnap.empty) {
		const batch = adminDb.batch();
		attemptsSnap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
	}

	// 4. Delete user's flashcards
	const flashcardsSnap = await adminDb.collection('flashcards').where('uid', '==', uid).get();
	if (!flashcardsSnap.empty) {
		const batch = adminDb.batch();
		flashcardsSnap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
	}

	// 5. Delete user's weak topics
	await adminDb
		.collection('weakTopics')
		.doc(uid)
		.delete()
		.catch(() => {});

	// 6. Delete shared courses created by the user
	const sharedSnap = await adminDb.collection('sharedCourses').where('ownerUid', '==', uid).get();
	if (!sharedSnap.empty) {
		const batch = adminDb.batch();
		sharedSnap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
	}

	// 7. Remove user from study groups memberships
	const groupsSnap = await adminDb
		.collection('studyGroups')
		.where('members', 'array-contains', uid)
		.get();
	if (!groupsSnap.empty) {
		for (const groupDoc of groupsSnap.docs) {
			await groupDoc.ref
				.update({
					members: FieldValue.arrayRemove(uid)
				})
				.catch(() => {});
		}
	}

	// 8. Delete usage record & user profile doc
	await adminDb
		.collection('usage')
		.doc(uid)
		.delete()
		.catch(() => {});
	await userRef.delete().catch(() => {});
}
