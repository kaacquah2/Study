import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		version: '1.0.0',
		timestamp: new Date().toISOString()
	});
};
