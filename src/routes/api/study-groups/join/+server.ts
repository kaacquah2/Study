/**
 * /api/study-groups/join — Join a Study Group using a 6-character Invite Code.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb, FieldValue } from '$lib/server/admin';

export async function POST({ request }) {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const inviteCode = (body?.inviteCode || '').trim().toUpperCase();

		if (!inviteCode || inviteCode.length < 4) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'A valid invite code is required.'
					}
				},
				{ status: 400 }
			);
		}

		const snapshot = await adminDb
			.collection('studyGroups')
			.where('inviteCode', '==', inviteCode)
			.limit(1)
			.get();

		if (snapshot.empty) {
			return json(
				{
					error: {
						code: 'NOT_FOUND',
						message: 'No study group found with this invite code.'
					}
				},
				{ status: 404 }
			);
		}

		const groupDoc = snapshot.docs[0];
		const groupData = groupDoc.data();

		if (groupData.memberUids.includes(user.uid)) {
			return json({
				success: true,
				message: 'Already a member of this group.',
				groupId: groupDoc.id
			});
		}

		await groupDoc.ref.update({
			memberUids: FieldValue.arrayUnion(user.uid)
		});

		return json({
			success: true,
			message: 'Joined group successfully.',
			groupId: groupDoc.id,
			groupName: groupData.name
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
