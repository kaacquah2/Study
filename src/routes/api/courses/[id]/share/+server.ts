import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import crypto from 'crypto';

// POST /api/courses/[id]/share
export async function POST({ params, url, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);

		// 1. Fetch course to verify ownership
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

		// 2. Fetch all modules to build the frozen snapshot
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
			// Only include ready modules in the shareable snapshot
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

		if (modules.length === 0) {
			return json(
				{
					error: {
						code: 'INVALID_STATE',
						message: 'Cannot share a course with no completed modules.'
					}
				},
				{ status: 400 }
			);
		}

		// 3. Generate a 12-character token
		const token = crypto.randomBytes(6).toString('hex'); // 12-char hex string

		// 4. Retrieve sharer name from user profile
		const userDoc = await adminDb.collection('users').doc(user.uid).get();
		const sharedByName = userDoc.data()?.displayName || user.name || 'Anonymous student';

		// 5. Store frozen snapshot in sharedCourses
		const shareRef = adminDb.collection('sharedCourses').doc(token);
		await shareRef.set({
			token,
			courseId,
			sharedByUid: user.uid,
			sharedByName,
			snapshot: {
				title: courseData.title,
				description: courseData.description,
				format: courseData.format,
				modules
			},
			claimCount: 0,
			revoked: false,
			createdAt: FieldValue.serverTimestamp()
		});

		const shareUrl = `${url.origin}/share/${token}`;
		return json({ token, url: shareUrl }, { status: 201 });
	} catch (err) {
		console.error('Create share token error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
}

// DELETE /api/courses/[id]/share (Revokes all shared links generated for this course)
export async function DELETE({ params, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);

		// Verify ownership of the course
		const courseDoc = await adminDb.collection('courses').doc(courseId).get();
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

		// Find and revoke all shared links pointing to this course
		const sharesQuery = await adminDb
			.collection('sharedCourses')
			.where('courseId', '==', courseId)
			.where('revoked', '==', false)
			.get();

		const batch = adminDb.batch();
		sharesQuery.forEach((doc) => {
			batch.update(doc.ref, { revoked: true });
		});

		await batch.commit();

		return new Response(null, { status: 204 });
	} catch (err) {
		console.error('Revoke share links error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
}
