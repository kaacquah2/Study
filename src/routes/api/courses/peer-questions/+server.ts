import type { RequestHandler } from './$types';
/**
 * /api/courses/peer-questions — Peer-Authored Quiz Questions submission & listing endpoint.
 *
 * Submits questions with initial status 'pending' after automated moderation checks.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { adminDb } from '$lib/server/admin';
import { moderateText } from '$lib/server/ai/moderation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const { courseId, question, options, correctAnswer, explanation } = body;

		if (!courseId || !question || !Array.isArray(options) || options.length < 2) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'courseId, question, and at least 2 options are required.'
					}
				},
				{ status: 400 }
			);
		}

		// Moderation check on submitted question text
		const modResult = await moderateText(`${question} ${options.join(' ')}`);
		if (modResult.flagged) {
			return json(
				{
					error: {
						code: 'CONTENT_FLAGGED',
						message: 'Submitted question violated safety policies.'
					}
				},
				{ status: 422 }
			);
		}

		const questionRef = adminDb.collection('peerQuestions').doc();
		const newQuestion = {
			id: questionRef.id,
			courseId,
			submittedBy: user.uid,
			question,
			options,
			correctAnswer: correctAnswer || 0,
			explanation: explanation || '',
			status: 'pending',
			createdAt: new Date().toISOString()
		};

		await questionRef.set(newQuestion);

		return json({ success: true, question: newQuestion }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		await verifySessionUser(request);
		const courseId = url.searchParams.get('courseId');

		let query = adminDb.collection('peerQuestions').where('status', '==', 'approved');
		if (courseId) {
			query = query.where('courseId', '==', courseId);
		}

		const snapshot = await query.get();
		const questions = snapshot.docs.map((doc) => doc.data());

		return json({ questions });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
