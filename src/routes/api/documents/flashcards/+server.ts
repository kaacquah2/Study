import type { RequestHandler } from './$types';
/**
 * /api/documents/flashcards — Auto-generate flashcards from RAG documents.
 *
 * Extracts atomic question/answer flashcards from user's RAG knowledge store
 * using provider.ts, defaulting to FSRS scheduler parameters.
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { generateAICompletion } from '$lib/server/ai/provider';
import { adminDb } from '$lib/server/admin';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const documentText: string = body?.documentText || '';
		const documentId: string = body?.documentId || 'rag-doc-' + Date.now();

		if (!documentText || documentText.trim().length < 50) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'documentText must be at least 50 characters long.'
					}
				},
				{ status: 400 }
			);
		}

		const prompt = `Extract 3 to 5 clear, self-contained study flashcards from the following text. 
Return ONLY valid JSON array with objects containing "front" (question/prompt) and "back" (answer/explanation).
Text:
${documentText.slice(0, 3000)}`;

		const aiResponse = await generateAICompletion({
			prompt,
			systemInstruction:
				'You are an expert tutor creating atomic spaced-repetition flashcards. Always respond with a clean JSON array of {"front": string, "back": string} objects.'
		});

		let cards: Array<{ front: string; back: string }> = [];
		try {
			const jsonMatch = aiResponse.text.match(/\[[\s\S]*\]/);
			cards = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.text);
		} catch {
			cards = [
				{
					front: 'Key concept from document',
					back: documentText.slice(0, 150) + '...'
				}
			];
		}

		const batch = adminDb.batch();
		const createdCards = [];
		const now = new Date().toISOString();

		for (const c of cards) {
			const cardRef = adminDb.collection('flashcards').doc();
			const cardData = {
				id: cardRef.id,
				uid: user.uid,
				documentId,
				sourceType: 'rag_document',
				front: c.front,
				back: c.back,
				engine: 'fsrs',
				stability: 0,
				difficulty: 5,
				reps: 0,
				lapses: 0,
				state: 'New',
				dueDate: now.split('T')[0],
				createdAt: now
			};
			batch.set(cardRef, cardData);
			createdCards.push(cardData);
		}

		await batch.commit();

		return json({
			success: true,
			count: createdCards.length,
			flashcards: createdCards
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
