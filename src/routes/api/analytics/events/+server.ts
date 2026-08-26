import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import {
	learningEventSchema,
	persistLearningEvent,
	getRecentUserLearningEvents,
	type LearningEvent
} from '$lib/server/analytics/learningEvents';
import { recordMistake, resolveMistake, type QuestionSnapshot } from '$lib/server/analytics/mistakeRecords';
import { aggregateSessionEvents, getUserLearningProfile } from '$lib/server/analytics/profileAggregator';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import { adminDb } from '$lib/server/admin';

export const POST: RequestHandler = async ({ request }) => {
	const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const user = await verifySessionUser(request);

		// Multi-bucket rate limit: 120 events per minute
		const minKey = Math.floor(Date.now() / 60000).toString();
		const usageRef = adminDb.collection('usage').doc(user.uid);
		try {
			await enforceRateLimit(usageRef, 120, minKey, 'analyticsEventCount', 'analyticsEventWindow', 60);
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many analytics events' } },
					{ status: 429, headers: { 'X-Request-Id': requestId } }
				);
			}
		}

		const body = await request.json();
		const rawEvents: unknown[] = Array.isArray(body) ? body : [body];

		const processedEvents: LearningEvent[] = [];

		for (const item of rawEvents) {
			const parsed = learningEventSchema.safeParse(item);
			if (!parsed.success) {
				return json(
					{
						error: {
							code: 'INVALID_EVENT_PAYLOAD',
							message: 'Invalid learning event structure',
							details: parsed.error.issues
						}
					},
					{ status: 400, headers: { 'X-Request-Id': requestId } }
				);
			}

			const validated = parsed.data;
			const event: LearningEvent = {
				...validated,
				eventId: validated.eventId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				userId: user.uid, // Server-authoritative override
				timestamp: validated.timestamp || new Date().toISOString()
			};

			// Persist raw event
			await persistLearningEvent(event);
			processedEvents.push(event);

			// Handle mistake tracking if question details are attached
			const mistakeQuestion = (item as { questionSnapshot?: QuestionSnapshot })?.questionSnapshot;
			const selectedIndex = (item as { selectedIndex?: number })?.selectedIndex;
			const questionId = (item as { questionId?: string })?.questionId;

			if (event.result === 'incorrect' && mistakeQuestion && typeof selectedIndex === 'number') {
				const qId = questionId || `${event.moduleId || 'mod'}_${Date.now()}`;
				await recordMistake(user.uid, qId, mistakeQuestion, selectedIndex, {
					conceptId: event.conceptId,
					conceptTag: event.metadata?.sourceLabel,
					moduleId: event.moduleId,
					courseId: event.courseId
				});
			} else if (event.result === 'correct' && questionId) {
				await resolveMistake(user.uid, questionId);
			}

			// Handle session aggregation
			if (event.eventType === 'session_ended') {
				const sessionDuration = event.durationMs || 0;
				await aggregateSessionEvents(user.uid, processedEvents, sessionDuration);
			}
		}

		return json(
			{
				success: true,
				processedCount: processedEvents.length,
				requestId
			},
			{ headers: { 'X-Request-Id': requestId } }
		);
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		if (errorMessage.includes('UNAUTHORIZED') || errorMessage.includes('Session expired')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
		}

		console.error('[analytics/events] Internal error:', err);
		return json(
			{ error: { code: 'INTERNAL_ERROR', message: 'Failed to record learning event' } },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};

export const GET: RequestHandler = async ({ request }) => {
	const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const user = await verifySessionUser(request);
		const profile = await getUserLearningProfile(user.uid);
		const recentEvents = await getRecentUserLearningEvents(user.uid, 20);

		return json(
			{
				profile,
				recentEvents,
				requestId
			},
			{ headers: { 'X-Request-Id': requestId } }
		);
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		if (errorMessage.includes('UNAUTHORIZED') || errorMessage.includes('Session expired')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
		}

		console.error('[analytics/events GET] Internal error:', err);
		return json(
			{ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics' } },
			{ status: 500, headers: { 'X-Request-Id': requestId } }
		);
	}
};
