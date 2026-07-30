import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

/**
 * GET /api/user/export
 * GDPR & CCPA Data Export endpoint.
 * Returns complete JSON dump of all stored user data, courses, modules, and quiz history.
 */
export async function GET({ request }) {
	try {
		const user = await verifySessionUser(request);

		// 1. User Profile & Usage
		const userDoc = await adminDb.collection('users').doc(user.uid).get();
		const usageDoc = await adminDb.collection('usage').doc(user.uid).get();

		// 2. User Courses
		const coursesSnap = await adminDb.collection('courses').where('ownerUid', '==', user.uid).get();

		const courses = [];
		for (const doc of coursesSnap.docs) {
			const courseData = { id: doc.id, ...doc.data() };

			// Fetch modules
			const modulesSnap = await doc.ref.collection('modules').orderBy('order').get();
			const modules = modulesSnap.docs.map((mDoc) => ({ id: mDoc.id, ...mDoc.data() }));

			courses.push({ ...courseData, modules });
		}

		// 3. Quiz Attempts
		const attemptsSnap = await adminDb
			.collection('quizAttempts')
			.where('userId', '==', user.uid)
			.get();
		const quizAttempts = attemptsSnap.docs.map((aDoc) => ({ id: aDoc.id, ...aDoc.data() }));

		// 4. Content Flags submitted by user
		const flagsSnap = await adminDb.collection('flags').where('userId', '==', user.uid).get();
		const submittedFlags = flagsSnap.docs.map((fDoc) => ({ id: fDoc.id, ...fDoc.data() }));

		const exportPackage = {
			exportDate: new Date().toISOString(),
			user: {
				uid: user.uid,
				email: user.email || null,
				profile: userDoc.exists ? userDoc.data() : null
			},
			usage: usageDoc.exists ? usageDoc.data() : null,
			coursesCount: courses.length,
			courses,
			quizAttempts,
			submittedFlags
		};

		return new Response(JSON.stringify(exportPackage, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="study_data_export_${user.uid}.json"`
			}
		});
	} catch (err) {
		console.error('Data Export error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to export user data' } },
			{ status: 500 }
		);
	}
}
