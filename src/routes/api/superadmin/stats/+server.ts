import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySuperAdmin, getSuperAdminStats } from '$lib/server/superadmin/user';

export const GET: RequestHandler = async ({ request }) => {
	try {
		await verifySuperAdmin(request);
		const stats = await getSuperAdminStats();
		return json({ stats });
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
};
