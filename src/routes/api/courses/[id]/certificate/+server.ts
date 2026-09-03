import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ params, request }) => {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You do not own this course' } },
				{ status: 403 }
			);
		}

		const completed = courseData?.progress?.completed || 0;
		const total = courseData?.moduleCount || 1;

		if (completed < total) {
			return json(
				{ error: { code: 'INCOMPLETE', message: 'Course is not yet 100% completed' } },
				{ status: 400 }
			);
		}

		const origin = new URL(request.url).origin;
		const existingShares = await adminDb
			.collection('sharedCourses')
			.where('courseId', '==', courseId)
			.where('revoked', '==', false)
			.limit(1)
			.get();

		let token: string;
		if (!existingShares.empty) {
			token = existingShares.docs[0].id;
		} else {
			token = crypto.randomBytes(16).toString('hex');
			const modulesSnapshot = await courseRef.collection('modules').orderBy('order', 'asc').get();
			interface SharedModule {
				order: number;
				type: 'lesson' | 'quiz';
				title: string;
				summary: string;
				pages: unknown;
				questions: unknown;
			}
			const modules: SharedModule[] = [];

			modulesSnapshot.forEach((doc) => {
				const data = doc.data();
				if (data.status === 'ready') {
					modules.push({
						order: data.order,
						type: data.type,
						title: data.title,
						summary: data.summary,
						pages: data.pages || null,
						questions: data.questions || null
					});
				}
			});

			const userDoc = await adminDb.collection('users').doc(user.uid).get();
			const sharedByName =
				userDoc.data()?.displayName || user.name || user.email || 'Anonymous student';

			await adminDb
				.collection('sharedCourses')
				.doc(token)
				.set({
					token,
					courseId,
					sharedByUid: user.uid,
					sharedByName,
					isPublic: false,
					snapshot: {
						title: courseData.title,
						description: courseData.description,
						format: courseData.format,
						modules
					},
					claimCount: 0,
					importCount: 0,
					revoked: false,
					createdAt: FieldValue.serverTimestamp()
				});
		}

		const certificate = {
			id: `CERT-${courseId.slice(0, 8).toUpperCase()}`,
			courseId,
			courseTitle: courseData.title,
			studentName: user.email || 'Learner',
			issuedAt: new Date().toISOString(),
			shareUrl: `${origin}/share/${token}`
		};

		return json({ certificate });
	} catch (err) {
		console.error('Certificate API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
