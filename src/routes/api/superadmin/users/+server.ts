import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySuperAdmin, listUsers } from '$lib/server/superadmin/user';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		await verifySuperAdmin(request);

		const q = url.searchParams.get('q') || undefined;
		const role = url.searchParams.get('role') || undefined;
		const status = url.searchParams.get('status') || undefined;

		const users = await listUsers({ q, role, status });

		return json({ users });
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
