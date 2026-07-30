import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export async function GET({ request }) {
	try {
		const user = await verifySessionUser(request);
		const todayStr = new Date().toISOString().split('T')[0];

		// Query user's courses
		const coursesSnap = await adminDb.collection('courses').where('ownerUid', '==', user.uid).get();

		const dueQuestions: Array<{
			courseId: string;
			courseTitle: string;
			moduleId: string;
			moduleTitle: string;
			questionIndex: number;
			question: string;
			options: string[];
			answerIndex: number;
			explanation?: string;
			nextReviewDate?: string;
			intervalDays?: number;
		}> = [];

		await Promise.all(
			coursesSnap.docs.map(async (courseDoc) => {
				const courseData = courseDoc.data();
				const modulesSnap = await courseDoc.ref.collection('modules').get();

				for (const modDoc of modulesSnap.docs) {
					const modData = modDoc.data();
					if (modData.type === 'quiz' && Array.isArray(modData.questions)) {
						modData.questions.forEach(
							(
								q: {
									question: string;
									options: string[];
									answerIndex: number;
									explanation?: string;
									nextReviewDate?: string;
									intervalDays?: number;
								},
								idx: number
							) => {
								if (q.nextReviewDate && q.nextReviewDate <= todayStr) {
									dueQuestions.push({
										courseId: courseDoc.id,
										courseTitle: courseData.title,
										moduleId: modDoc.id,
										moduleTitle: modData.title,
										questionIndex: idx,
										question: (q as { prompt?: string; question?: string }).prompt || q.question,
										options: q.options,
										answerIndex:
											(q as { correctIndex?: number; answerIndex?: number }).correctIndex ??
											q.answerIndex ??
											0,
										explanation: q.explanation,
										nextReviewDate: q.nextReviewDate,
										intervalDays: q.intervalDays
									});
								}
							}
						);
					}
				}
			})
		);

		const firstCourseIdWithDue = dueQuestions.length > 0 ? dueQuestions[0].courseId : null;

		return json({
			dueQuestions,
			today: todayStr,
			count: dueQuestions.length,
			firstCourseIdWithDue
		});
	} catch (err) {
		console.error('Spaced Repetition Due API error:', err);
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
