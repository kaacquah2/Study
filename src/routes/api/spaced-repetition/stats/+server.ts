import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { optimizeFSRSWeights, type FSRSReviewLog } from '$lib/server/fsrs';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		const logsSnap = await adminDb
			.collection('users')
			.doc(user.uid)
			.collection('fsrsReviewLogs')
			.orderBy('timestamp', 'desc')
			.limit(200)
			.get();

		const logs: FSRSReviewLog[] = logsSnap.docs.map((doc) => {
			const data = doc.data();
			return {
				courseId: data.courseId || '',
				moduleId: data.moduleId || '',
				questionIndex: data.questionIndex || 0,
				quality: data.quality || 0,
				elapsedDays: data.elapsedDays || 0,
				predictedRetrievability: data.predictedRetrievability || 0,
				newStability: data.newStability || 0,
				newDifficulty: data.newDifficulty || 0,
				timestamp: data.timestamp || ''
			};
		});

		const stats = optimizeFSRSWeights(logs);

		return json({
			success: true,
			stats
		});
	} catch (err) {
		console.error('FSRS Stats API error:', err);
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
