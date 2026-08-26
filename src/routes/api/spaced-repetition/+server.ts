import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { enforceRateLimit } from '$lib/server/rateLimiter';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		// Multi-bucket rate limit: 50 card writes per 10 minutes
		const tenMinKey = Math.floor(Date.now() / 600000).toString();
		const usageRef = adminDb.collection('usage').doc(user.uid);
		try {
			await enforceRateLimit(
				usageRef,
				50,
				tenMinKey,
				'fsrsCardWriteCount',
				'fsrsCardWriteWindow',
				600
			);
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message:
								'Card creation rate limit reached. Please wait a few minutes before adding more cards.'
						}
					},
					{ status: 429 }
				);
			}
		}

		interface IncomingCardItem {
			front?: string;
			back?: string;
			courseId?: string | null;
			moduleId?: string | null;
			conceptId?: string | null;
			conceptTag?: string | null;
			sourceType?: string;
		}

		type ProcessedCard =
			| { id: string; updated: boolean; conceptId: string | null }
			| {
					id: string;
					uid: string;
					courseId: string | null;
					moduleId: string | null;
					conceptId: string | null;
					sourceType: string;
					front: string;
					back: string;
					engine: string;
					stability: number;
					difficulty: number;
					reps: number;
					lapses: number;
					state: string;
					dueDate: string;
					createdAt: string;
			  };

		const body = await request.json();
		const cardsToProcess: IncomingCardItem[] = Array.isArray(body?.cards) ? body.cards : [body];

		if (cardsToProcess.length === 0) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'No flashcards provided in payload.' } },
				{ status: 400 }
			);
		}

		const now = new Date().toISOString();
		const todayStr = now.split('T')[0];
		const processedCards: ProcessedCard[] = [];

		const batch = adminDb.batch();

		for (const cardItem of cardsToProcess.slice(0, 20)) {
			const front = (cardItem?.front || '').trim();
			const back = (cardItem?.back || '').trim();
			const courseId = cardItem?.courseId || null;
			const moduleId = cardItem?.moduleId || null;
			const conceptId = cardItem?.conceptId || cardItem?.conceptTag || null;

			if (!front) continue;

			// Check if card with identical conceptId exists in user's collection (deduplication)
			let existingCardDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
			if (conceptId && courseId && moduleId) {
				const existingSnap = await adminDb
					.collection('flashcards')
					.where('uid', '==', user.uid)
					.where('courseId', '==', courseId)
					.where('moduleId', '==', moduleId)
					.where('conceptId', '==', conceptId)
					.limit(1)
					.get();

				if (!existingSnap.empty) {
					existingCardDoc = existingSnap.docs[0];
				}
			}

			if (existingCardDoc) {
				// Deduplicated update: increment lapse, set for immediate relearning review
				const existingData = existingCardDoc.data();
				const updatedLapses = (existingData.lapses || 0) + 1;
				batch.update(existingCardDoc.ref, {
					lapses: updatedLapses,
					state: 'Relearning',
					dueDate: todayStr,
					lastUpdated: now
				});
				processedCards.push({ id: existingCardDoc.id, updated: true, conceptId });
			} else {
				// Create new FSRS-4.5 card
				const newCardRef = adminDb.collection('flashcards').doc();
				const newCardData = {
					id: newCardRef.id,
					uid: user.uid,
					courseId,
					moduleId,
					conceptId,
					sourceType: cardItem.sourceType || 'user_created',
					front,
					back: back || 'No description provided.',
					engine: 'fsrs',
					stability: 0,
					difficulty: 5,
					reps: 0,
					lapses: 0,
					state: 'New',
					dueDate: todayStr,
					createdAt: now
				};
				batch.set(newCardRef, newCardData);
				processedCards.push(newCardData);
			}
		}

		await batch.commit();

		return json({
			success: true,
			count: processedCards.length,
			cards: processedCards
		});
	} catch (err) {
		console.error('Save flashcard error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
