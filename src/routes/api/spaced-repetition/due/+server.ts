import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await verifySessionUser(request);
		const todayStr = new Date().toISOString().split('T')[0];

		const courseIdFilter = url.searchParams.get('courseId');
		const moduleIdFilter = url.searchParams.get('moduleId');
		const modeFilter = url.searchParams.get('mode') || 'due'; // 'due' or 'all'

		// Query user's courses
		const coursesSnap = await adminDb.collection('courses').where('ownerUid', '==', user.uid).get();

		interface QuestionCard {
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
			isDue: boolean;
		}

		interface DeckInfo {
			courseId: string;
			courseTitle: string;
			moduleId: string;
			moduleTitle: string;
			dueCount: number;
			totalCount: number;
		}

		const availableDecks: DeckInfo[] = [];
		const allCollectedQuestions: QuestionCard[] = [];
		let totalDueCount = 0;
		let totalCardsCount = 0;

		await Promise.all(
			coursesSnap.docs.map(async (courseDoc) => {
				const courseData = courseDoc.data();
				const modulesSnap = await courseDoc.ref.collection('modules').get();

				for (const modDoc of modulesSnap.docs) {
					const modData = modDoc.data();
					if (
						modData.type === 'quiz' &&
						Array.isArray(modData.questions) &&
						modData.questions.length > 0
					) {
						let deckDueCount = 0;
						const deckTotalCount = modData.questions.length;

						modData.questions.forEach(
							(
								q: {
									question?: string;
									prompt?: string;
									options?: string[];
									answerIndex?: number;
									correctIndex?: number;
									explanation?: string;
									nextReviewDate?: string;
									intervalDays?: number;
								},
								idx: number
							) => {
								const isDue = !q.nextReviewDate || q.nextReviewDate <= todayStr;
								if (isDue) {
									deckDueCount += 1;
									totalDueCount += 1;
								}
								totalCardsCount += 1;

								allCollectedQuestions.push({
									courseId: courseDoc.id,
									courseTitle: courseData.title || 'Untitled Course',
									moduleId: modDoc.id,
									moduleTitle: modData.title || 'Untitled Quiz',
									questionIndex: idx,
									question: q.prompt || q.question || `Question ${idx + 1}`,
									options: q.options || [],
									answerIndex: q.correctIndex ?? q.answerIndex ?? 0,
									explanation: q.explanation,
									nextReviewDate: q.nextReviewDate,
									intervalDays: q.intervalDays,
									isDue
								});
							}
						);

						availableDecks.push({
							courseId: courseDoc.id,
							courseTitle: courseData.title || 'Untitled Course',
							moduleId: modDoc.id,
							moduleTitle: modData.title || 'Untitled Quiz',
							dueCount: deckDueCount,
							totalCount: deckTotalCount
						});
					}
				}
			})
		);

		// Sort decks by dueCount descending then courseTitle
		availableDecks.sort(
			(a, b) => b.dueCount - a.dueCount || a.courseTitle.localeCompare(b.courseTitle)
		);

		// Apply filters
		const dueQuestions = allCollectedQuestions.filter((q) => {
			if (courseIdFilter && q.courseId !== courseIdFilter) return false;
			if (moduleIdFilter && q.moduleId !== moduleIdFilter) return false;
			if (modeFilter === 'due') return q.isDue;
			return true; // mode === 'all'
		});

		const firstCourseIdWithDue = availableDecks.find((d) => d.dueCount > 0)?.courseId || null;

		return json({
			dueQuestions,
			availableDecks,
			today: todayStr,
			count: dueQuestions.length,
			totalDueCount,
			totalCardsCount,
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
};
