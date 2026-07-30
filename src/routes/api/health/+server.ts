import { json } from '@sveltejs/kit';

export async function GET() {
	return json({
		status: 'ok',
		version: '1.0.0',
		timestamp: new Date().toISOString()
	});
}
