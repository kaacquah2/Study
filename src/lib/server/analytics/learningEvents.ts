import { z } from 'zod';
import { adminDb, FieldValue } from '$lib/server/admin';

export type LearningEventType =
	| 'lesson_started'
	| 'lesson_completed'
	| 'quiz_started'
	| 'quiz_completed'
	| 'question_answered'
	| 'flashcard_reviewed'
	| 'ai_help_requested'
	| 'weak_area_detected'
	| 'recommendation_shown'
	| 'document_uploaded'
	| 'session_started'
	| 'session_ended';

export interface LearningEventMetadata {
	quizScore?: number; // 0–100 for quiz_completed
	totalQuestions?: number;
	sourceLabel?: string; // "Chapter 3" or "Generated Lesson"
	aiProvider?: 'gemini' | 'ollama' | 'ml_backend';
	recommendationType?: string; // for recommendation_shown
	confidenceRating?: number; // 1-4
	timeSpentSeconds?: number;
}

export interface LearningEvent {
	eventId: string; // unique UUID
	userId: string; // verified from auth token
	sessionId: string; // groups events in one study session
	eventType: LearningEventType;
	timestamp: string; // ISO 8601 string
	courseId?: string;
	moduleId?: string;
	conceptId?: string;
	result?: 'correct' | 'incorrect' | 'skipped';
	durationMs?: number;
	metadata?: LearningEventMetadata;
}

export const learningEventSchema = z.object({
	eventId: z.string().min(1),
	sessionId: z.string().min(1),
	eventType: z.enum([
		'lesson_started',
		'lesson_completed',
		'quiz_started',
		'quiz_completed',
		'question_answered',
		'flashcard_reviewed',
		'ai_help_requested',
		'weak_area_detected',
		'recommendation_shown',
		'document_uploaded',
		'session_started',
		'session_ended'
	]),
	timestamp: z.string().datetime().optional(),
	courseId: z.string().optional(),
	moduleId: z.string().optional(),
	conceptId: z.string().optional(),
	result: z.enum(['correct', 'incorrect', 'skipped']).optional(),
	durationMs: z.number().nonnegative().optional(),
	metadata: z
		.object({
			quizScore: z.number().min(0).max(100).optional(),
			totalQuestions: z.number().int().positive().optional(),
			sourceLabel: z.string().max(200).optional(),
			aiProvider: z.enum(['gemini', 'ollama', 'ml_backend']).optional(),
			recommendationType: z.string().max(100).optional(),
			confidenceRating: z.number().min(1).max(4).optional(),
			timeSpentSeconds: z.number().nonnegative().optional()
		})
		.optional()
});

/**
 * Filter for events worth persisting permanently to prevent Firestore unbounded bloat.
 * Meaningful events: quiz_completed, question_answered, flashcard_reviewed, lesson_completed, session_ended.
 */
const MEANINGFUL_EVENT_TYPES: Set<LearningEventType> = new Set([
	'quiz_completed',
	'question_answered',
	'flashcard_reviewed',
	'lesson_completed',
	'session_ended',
	'weak_area_detected',
	'ai_help_requested'
]);

/**
 * Persists a validated learning event to Firestore under the user's subcollection.
 */
export async function persistLearningEvent(event: LearningEvent): Promise<void> {
	if (!MEANINGFUL_EVENT_TYPES.has(event.eventType)) {
		return;
	}

	const userEventsCol = adminDb.collection('learningEvents').doc(event.userId).collection('events');

	await userEventsCol.doc(event.eventId).set({
		...event,
		persistedAt: FieldValue.serverTimestamp()
	});
}

/**
 * Retrieves recent learning events for a given user.
 */
export async function getRecentUserLearningEvents(
	userId: string,
	limitCount: number = 100
): Promise<LearningEvent[]> {
	const snapshot = await adminDb
		.collection('learningEvents')
		.doc(userId)
		.collection('events')
		.orderBy('timestamp', 'desc')
		.limit(limitCount)
		.get();

	return snapshot.docs.map((doc) => doc.data() as LearningEvent);
}
