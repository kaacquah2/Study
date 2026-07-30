/**
 * /api/study-groups — Study Group management endpoint.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb, FieldValue } from '$lib/server/admin';

export async function POST({ request }) {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const { name, courseId } = body;

		if (!name || name.trim().length < 3) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'Group name must be at least 3 characters long.'
					}
				},
				{ status: 400 }
			);
		}

		const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
		const groupRef = adminDb.collection('studyGroups').doc();
		const groupData = {
			id: groupRef.id,
			name: name.trim(),
			ownerUid: user.uid,
			inviteCode,
			courseId: courseId || null,
			memberUids: [user.uid],
			createdAt: new Date().toISOString()
		};

		await groupRef.set(groupData);

		return json({ success: true, group: groupData }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}

export async function GET({ request }) {
	try {
		const user = await verifySessionUser(request);

		const snapshot = await adminDb
			.collection('studyGroups')
			.where('memberUids', 'array-contains', user.uid)
			.get();

		const groups = snapshot.docs.map((doc) => doc.data());

		return json({ groups });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
