import { adminDb, FieldValue } from '$lib/server/admin';
import type { LearningEvent } from './learningEvents';

export interface ConceptMasteryAggregate {
	conceptId: string;
	conceptTag: string;
	totalAttempts: number;
	correctCount: number;
	accuracy: number; // 0-100
	isWeak: boolean;
	lastAttemptAt: string;
}

export interface RecentActivitySummary {
	sessionId: string;
	eventType: string;
	courseId?: string;
	moduleId?: string;
	timestamp: string;
	summaryText: string;
}

export interface UserLearningProfile {
	userId: string;
	totalStudyTimeMs: number;
	sessionCount: number;
	lastSessionAt: string;
	conceptsMastery: Record<string, ConceptMasteryAggregate>;
	weakConcepts: string[]; // List of conceptIds or tags below 70% threshold
	recentActivity: RecentActivitySummary[];
	updatedAt: string;
}

/**
 * Retrieves the aggregated learning profile for a user, or default profile if none exists.
 */
export async function getUserLearningProfile(userId: string): Promise<UserLearningProfile> {
	const docRef = adminDb.collection('userLearningProfile').doc(userId);
	const docSnap = await docRef.get();

	if (docSnap.exists) {
		return docSnap.data() as UserLearningProfile;
	}

	return {
		userId,
		totalStudyTimeMs: 0,
		sessionCount: 0,
		lastSessionAt: new Date().toISOString(),
		conceptsMastery: {},
		weakConcepts: [],
		recentActivity: [],
		updatedAt: new Date().toISOString()
	};
}

/**
 * Aggregates learning events from a completed session into the user's permanent profile.
 */
export async function aggregateSessionEvents(
	userId: string,
	events: LearningEvent[],
	sessionDurationMs: number = 0
): Promise<UserLearningProfile> {
	const currentProfile = await getUserLearningProfile(userId);

	const conceptsMap = { ...currentProfile.conceptsMastery };
	let totalNewTime = sessionDurationMs;

	for (const ev of events) {
		if (ev.durationMs && !sessionDurationMs) {
			totalNewTime += ev.durationMs;
		}

		if (ev.conceptId && ev.result) {
			const tag = ev.metadata?.sourceLabel || ev.conceptId;
			const existing = conceptsMap[ev.conceptId] || {
				conceptId: ev.conceptId,
				conceptTag: tag,
				totalAttempts: 0,
				correctCount: 0,
				accuracy: 0,
				isWeak: false,
				lastAttemptAt: ev.timestamp
			};

			existing.totalAttempts += 1;
			if (ev.result === 'correct') {
				existing.correctCount += 1;
			}
			existing.accuracy = Math.round((existing.correctCount / existing.totalAttempts) * 100);
			existing.isWeak = existing.accuracy < 70 && existing.totalAttempts >= 2;
			existing.lastAttemptAt = ev.timestamp;

			conceptsMap[ev.conceptId] = existing;
		}
	}

	const weakConcepts = Object.values(conceptsMap)
		.filter((c) => c.isWeak)
		.map((c) => c.conceptId);

	// Build recent activity entries
	const newActivities: RecentActivitySummary[] = events
		.filter((e) =>
			['quiz_completed', 'lesson_completed', 'flashcard_reviewed'].includes(e.eventType)
		)
		.map((e) => ({
			sessionId: e.sessionId,
			eventType: e.eventType,
			courseId: e.courseId,
			moduleId: e.moduleId,
			timestamp: e.timestamp,
			summaryText: formatActivitySummary(e)
		}));

	const updatedActivity = [...newActivities, ...currentProfile.recentActivity].slice(0, 20);

	const updatedProfile: UserLearningProfile = {
		userId,
		totalStudyTimeMs: currentProfile.totalStudyTimeMs + totalNewTime,
		sessionCount: currentProfile.sessionCount + 1,
		lastSessionAt: new Date().toISOString(),
		conceptsMastery: conceptsMap,
		weakConcepts,
		recentActivity: updatedActivity,
		updatedAt: new Date().toISOString()
	};

	await adminDb
		.collection('userLearningProfile')
		.doc(userId)
		.set({
			...updatedProfile,
			serverUpdatedAt: FieldValue.serverTimestamp()
		});

	return updatedProfile;
}

function formatActivitySummary(event: LearningEvent): string {
	switch (event.eventType) {
		case 'quiz_completed':
			return `Completed quiz with score ${event.metadata?.quizScore ?? 0}%`;
		case 'lesson_completed':
			return `Completed interactive lesson`;
		case 'flashcard_reviewed':
			return `Reviewed spaced repetition flashcard`;
		default:
			return `Studied topic`;
	}
}
