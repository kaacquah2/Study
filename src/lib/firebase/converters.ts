import type {
	FirestoreDataConverter,
	DocumentData,
	QueryDocumentSnapshot
} from 'firebase/firestore';

export interface CourseDoc {
	id?: string;
	ownerUid: string;
	title: string;
	description: string;
	topic: string;
	format: 'lessons_and_quizzes' | 'quizzes_only';
	moduleCount: number;
	status: 'draft' | 'building' | 'ready' | 'partial' | 'failed';
	accent?: 'violet' | 'amber' | 'emerald';
	level?: 'beginner' | 'intermediate' | 'advanced';
	estimatedMinutes?: number;
	tags?: string[];
	goal?: string;
	progress?: { completed: number; total: number };
	clonedFrom?: string | null;
	createdAt?: unknown;
	updatedAt?: unknown;
}

export type LessonBlock =
	| { type: 'text'; markdown: string }
	| {
			type: 'callout';
			style: 'tip' | 'warning' | 'example' | 'deep-dive';
			title: string;
			markdown: string;
	  }
	| { type: 'diagram'; mermaid: string; caption?: string }
	| { type: 'term'; term: string; definition: string }
	| { type: 'check'; prompt: string; options: string[]; answerIndex: number; explanation: string }
	| { type: 'flashcard'; front: string; back: string }
	| { type: 'code'; language: string; code: string; runnable?: boolean }
	| { type: 'mindmap-node'; nodeId: string; label: string };

export interface ModuleDoc {
	id?: string;
	order: number;
	type: 'lesson' | 'quiz';
	title: string;
	summary: string;
	learningObjective?: string;
	keyPoints?: string[];
	status: 'pending' | 'generating' | 'ready' | 'failed';
	estimatedMinutes?: number;
	error?: string | null;
	attempts?: number;
	contentVersion?: 1 | 2;
	pages?: Array<{
		order: number;
		heading: string;
		subheading?: string;
		body?: string;
		blocks?: LessonBlock[];
	}> | null;
	questions?: Array<{
		prompt?: string;
		question?: string;
		options: string[];
		correctIndex?: number;
		answerIndex?: number;
		explanation: string;
		lastAnsweredCorrectly?: boolean;
		nextReviewDate?: string;
		intervalDays?: number;
	}> | null;
	concepts?: Array<{
		id: string;
		term: string;
		aliases: string[];
		summary?: string;
	}> | null;
	completed?: boolean;
	model?: string;
	generatedAt?: unknown;
}

export interface UserProfileDoc {
	uid: string;
	email: string;
	displayName: string | null;
	photoURL: string | null;
	theme?: string;
	badges?: string[];
	longestStreak?: number;
	streakFreezes?: number;
	isAdmin?: boolean;
	onboardingComplete?: boolean;
	streak?: {
		current: number;
		longest: number;
		lastStudiedOn: string | null;
		timezone: string;
	};
}

export interface SharedCourseDoc {
	id?: string;
	courseId: string;
	sharedByUid: string;
	sharedByName: string;
	claimCount: number;
	importCount?: number;
	isOfficial?: boolean;
	tags?: string[];
	level?: 'beginner' | 'intermediate' | 'advanced';
	revoked?: boolean;
	snapshot: {
		title: string;
		description: string;
		format: 'lessons_and_quizzes' | 'quizzes_only';
		modules: ModuleDoc[];
	};
	createdAt?: unknown;
}

export const createConverter = <T extends object>(): FirestoreDataConverter<T> => ({
	toFirestore: (data: T): DocumentData => {
		// Return document details without the id field
		const rest = { ...data } as Record<string, unknown>;
		delete rest.id;
		return rest;
	},
	fromFirestore: (snapshot: QueryDocumentSnapshot): T => {
		const data = snapshot.data();
		return {
			id: snapshot.id,
			...data
		} as unknown as T;
	}
});
