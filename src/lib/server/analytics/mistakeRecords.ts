import { adminDb, FieldValue } from '$lib/server/admin';

export interface QuestionSnapshot {
	prompt: string;
	options: string[];
	correctIndex: number;
	explanation: string;
}

export interface MistakeRecord {
	mistakeId: string;
	userId: string;
	questionId: string;
	questionSnapshot: QuestionSnapshot;
	selectedIndex: number; // what the student answered
	conceptId?: string;
	conceptTag?: string;
	moduleId?: string;
	courseId?: string;
	mistakeCount: number; // incremented on repeated mistakes
	firstMistakeAt: string;
	lastMistakeAt: string;
	resolved: boolean; // true when answered correctly subsequently
}

/**
 * Records or updates a mistake for a given question in the user's mistake records.
 */
export async function recordMistake(
	userId: string,
	questionId: string,
	questionSnapshot: QuestionSnapshot,
	selectedIndex: number,
	context: {
		conceptId?: string;
		conceptTag?: string;
		moduleId?: string;
		courseId?: string;
	} = {}
): Promise<void> {
	const mistakeRef = adminDb
		.collection('mistakeRecords')
		.doc(userId)
		.collection('mistakes')
		.doc(questionId);

	const existingDoc = await mistakeRef.get();
	const nowStr = new Date().toISOString();

	if (existingDoc.exists) {
		const data = existingDoc.data() as MistakeRecord;
		await mistakeRef.update({
			mistakeCount: (data.mistakeCount || 1) + 1,
			lastMistakeAt: nowStr,
			selectedIndex,
			resolved: false,
			updatedAt: FieldValue.serverTimestamp()
		});
	} else {
		const newRecord: MistakeRecord = {
			mistakeId: questionId,
			userId,
			questionId,
			questionSnapshot,
			selectedIndex,
			conceptId: context.conceptId,
			conceptTag: context.conceptTag,
			moduleId: context.moduleId,
			courseId: context.courseId,
			mistakeCount: 1,
			firstMistakeAt: nowStr,
			lastMistakeAt: nowStr,
			resolved: false
		};

		await mistakeRef.set({
			...newRecord,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp()
		});
	}
}

/**
 * Marks a mistake as resolved when the user answers correctly.
 */
export async function resolveMistake(userId: string, questionId: string): Promise<void> {
	const mistakeRef = adminDb
		.collection('mistakeRecords')
		.doc(userId)
		.collection('mistakes')
		.doc(questionId);

	const existingDoc = await mistakeRef.get();
	if (existingDoc.exists) {
		await mistakeRef.update({
			resolved: true,
			resolvedAt: new Date().toISOString(),
			updatedAt: FieldValue.serverTimestamp()
		});
	}
}

/**
 * Gets all unresolved mistakes for a user, optionally filtered by module or concept.
 */
export async function getUserMistakes(
	userId: string,
	options: { moduleId?: string; resolved?: boolean; limit?: number } = {}
): Promise<MistakeRecord[]> {
	let query: FirebaseFirestore.Query = adminDb
		.collection('mistakeRecords')
		.doc(userId)
		.collection('mistakes');

	if (typeof options.resolved === 'boolean') {
		query = query.where('resolved', '==', options.resolved);
	}

	if (options.moduleId) {
		query = query.where('moduleId', '==', options.moduleId);
	}

	query = query.orderBy('lastMistakeAt', 'desc').limit(options.limit || 50);

	const snapshot = await query.get();
	return snapshot.docs.map((doc) => doc.data() as MistakeRecord);
}
