import { json } from '@sveltejs/kit';
import {
	verifySuperAdmin,
	getUserDetails,
	updateUserAdminState
} from '$lib/server/superadmin/user';

export async function GET({ request, params }) {
	try {
		await verifySuperAdmin(request);
		const user = await getUserDetails(params.uid);
		return json({ user });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal Server Error';
		if (message.includes('FORBIDDEN')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}

export async function PATCH({ request, params }) {
	try {
		await verifySuperAdmin(request);

		const body = await request.json();
		const { role, isBanned, bannedReason } = body;

		await updateUserAdminState(params.uid, {
			role,
			isBanned,
			bannedReason
		});

		return json({ success: true, message: 'User updated successfully' });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal Server Error';
		if (message.includes('FORBIDDEN')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
