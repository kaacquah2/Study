import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb } from '$lib/server/admin';
import {
	computeModuleMastery,
	type QuizQuestion
} from '$lib/server/knowledgeMap/masteryCalculator';
import { getUserMistakes } from '$lib/server/analytics/mistakeRecords';

export const GET: RequestHandler = async ({ request, url }) => {
	const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const user = await verifySessionUser(request);
		const moduleId = url.searchParams.get('moduleId');
		const courseId = url.searchParams.get('courseId');

		if (!moduleId) {
			return json(
				{ error: { code: 'MISSING_PARAM', message: 'moduleId is required' } },
				{ status: 400, headers: { 'X-Request-Id': requestId } }
			);
		}

		// 1. Fetch module questions if courseId is provided
		let questions: QuizQuestion[] = [];
		let moduleTitle = 'Module';

		if (courseId) {
			const modDoc = await adminDb
				.collection('courses')
				.doc(courseId)
				.collection('modules')
				.doc(moduleId)
				.get();

			if (modDoc.exists) {
				const modData = modDoc.data();
				moduleTitle = modData?.title || 'Module';
				questions = (modData?.quiz?.questions || []) as QuizQuestion[];
			}
		}

		// 2. Fetch module mastery
		const mastery = computeModuleMastery(moduleId, questions);

		// 3. Fetch mistake records for this module
		const mistakes = await getUserMistakes(user.uid, { moduleId, resolved: false });

		// 4. Build empirical evidence list
		const evidence: string[] = [];

		if (mastery.masteryBreakdown.quizAccuracy > 0) {
			evidence.push(`Active recall quiz accuracy is ${mastery.masteryBreakdown.quizAccuracy}%`);
		} else {
			evidence.push('No active recall quiz attempts recorded yet');
		}

		if (mistakes.length > 0) {
			evidence.push(`${mistakes.length} recorded mistake(s) pending resolution`);
		}

		if (mastery.questionsDue > 0) {
			evidence.push(`${mastery.questionsDue} flashcard(s) due for spaced repetition review`);
		}

		if (mastery.averageStability > 0) {
			evidence.push(`Memory retention stability estimated at ${mastery.averageStability} days`);
		}

		if (mastery.masteryBreakdown.recencyScore < 70) {
			evidence.push('Topic has not been reviewed recently (decay penalty applied)');
		}

		// 5. Determine weak reason summary
		let weakReasonSummary = '';
		if (mastery.masteryPercent >= 80) {
			weakReasonSummary = `Your mastery in "${moduleTitle}" is high (${mastery.masteryPercent}%). Focus on periodic review to maintain long-term retention.`;
		} else if (mastery.masteryPercent >= 40) {
			weakReasonSummary = `Your mastery in "${moduleTitle}" is developing (${mastery.masteryPercent}%). Practice missed questions and review due flashcards to reach mastery.`;
		} else {
			weakReasonSummary = `Your mastery in "${moduleTitle}" is currently low (${mastery.masteryPercent}%). High error rate or lack of recent active recall practice detected.`;
		}

		// 6. Build recommended actions
		const recommendations = [];

		if (mistakes.length > 0) {
			recommendations.push({
				action: 'review_mistakes',
				label: `Practice ${mistakes.length} Mistake(s)`,
				url: `/app/mistakes?moduleId=${moduleId}`
			});
		}

		if (mastery.questionsDue > 0) {
			recommendations.push({
				action: 'review_flashcards',
				label: 'Review Due Flashcards',
				url: `/app/review?moduleId=${moduleId}`
			});
		}

		if (courseId) {
			recommendations.push({
				action: 'review_lesson',
				label: 'Review Lesson Text',
				url: `/app/courses/${courseId}/modules/${moduleId}`
			});
		}

		return json(
			{
				moduleId,
				moduleTitle,
				masteryPercent: mastery.masteryPercent,
				confidenceLevel: mastery.confidenceLevel,
				evidenceCount: mastery.evidenceCount,
				breakdown: mastery.masteryBreakdown,
				averageStability: mastery.averageStability,
				weakReasonSummary,
				evidence,
				unresolvedMistakeCount: mistakes.length,
				recommendations,
				requestId
			},
			{ headers: { 'X-Request-Id': requestId } }
		);
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		if (errorMessage.includes('UNAUTHORIZED') || errorMessage.includes('Session expired')) {
			return json(
				{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
				{ status: 401 }
			);
		}

		console.error('[knowledge-map/explain] Error:', err);
		return json(
			{ error: { code: 'INTERNAL_ERROR', message: 'Failed to explain progress' } },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};
