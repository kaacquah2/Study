import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

// POST /api/share/[token]/claim
export const POST: RequestHandler = async ({ params, request }) => {
	const { token } = params;

	try {
		const user = await verifySessionUser(request);

		const shareRef = adminDb.collection('sharedCourses').doc(token);
		const userClaimsRef = adminDb.collection('users').doc(user.uid).collection('claims').doc(token);

		// We execute the claim inside a transaction to atomically clone the course and update claim stats
		const result = await adminDb.runTransaction(async (transaction) => {
			// Check if already claimed
			const existingClaimDoc = await transaction.get(userClaimsRef);
			if (existingClaimDoc.exists) {
				return {
					isSelfClaim: false,
					courseId: existingClaimDoc.data()?.courseId,
					alreadyClaimed: true
				};
			}

			const shareDoc = await transaction.get(shareRef);

			if (!shareDoc.exists) {
				throw new Error('SHARE_LINK_NOT_FOUND');
			}

			const shareData = shareDoc.data();
			if (!shareData) {
				throw new Error('SHARE_LINK_NOT_FOUND');
			}
			if (shareData.revoked) {
				throw new Error('SHARE_LINK_REVOKED');
			}

			// Check if it's a self-claim
			if (shareData.sharedByUid === user.uid) {
				return { isSelfClaim: true, courseId: shareData.courseId, alreadyClaimed: false };
			}

			const snapshot = shareData.snapshot;
			const newCourseRef = adminDb.collection('courses').doc();
			const newCourseId = newCourseRef.id;

			// Update claimCount and importCount in sharedCourses
			transaction.update(shareRef, {
				claimCount: FieldValue.increment(1),
				importCount: FieldValue.increment(1)
			});

			// Write cloned course document
			const accents = ['violet', 'amber', 'emerald'] as const;
			const accent = accents[Math.floor(Math.random() * accents.length)];

			transaction.set(newCourseRef, {
				id: newCourseId,
				ownerUid: user.uid,
				title: snapshot.title,
				description: snapshot.description,
				topic: `Cloned from ${shareData.sharedByName}`,
				format: snapshot.format,
				moduleCount: snapshot.modules.length,
				status: 'ready',
				accent: accent,
				progress: { completed: 0, total: snapshot.modules.length },
				clonedFrom: shareData.courseId,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});

			// Write cloned module documents
			for (const mod of snapshot.modules) {
				const newModuleRef = newCourseRef.collection('modules').doc();
				transaction.set(newModuleRef, {
					id: newModuleRef.id,
					courseId: newCourseRef.id,
					ownerUid: user.uid,
					order: mod.order,
					type: mod.type,
					title: mod.title,
					summary: mod.summary,
					status: 'ready',
					error: null,
					attempts: 0,
					pages: mod.pages || null,
					questions: mod.questions || null,
					model: 'cloned',
					generatedAt: FieldValue.serverTimestamp(),
					tokensIn: 0,
					tokensOut: 0
				});
			}

			// Initialize empty progress tracking document
			const progressRef = adminDb
				.collection('users')
				.doc(user.uid)
				.collection('progress')
				.doc(newCourseId);
			transaction.set(progressRef, {
				courseId: newCourseId,
				completedModuleIds: [],
				quizScores: {},
				lastPage: {},
				updatedAt: FieldValue.serverTimestamp()
			});

			// Record claim to prevent duplicate claiming
			transaction.set(userClaimsRef, {
				courseId: newCourseId,
				claimedAt: FieldValue.serverTimestamp()
			});

			return { isSelfClaim: false, courseId: newCourseId, alreadyClaimed: false };
		});

		if (result.isSelfClaim) {
			return json({ courseId: result.courseId, isSelfClaim: true }, { status: 200 });
		}

		if (result.alreadyClaimed) {
			return json(
				{ courseId: result.courseId, isSelfClaim: false, alreadyClaimed: true },
				{ status: 200 }
			);
		}

		return json(
			{ courseId: result.courseId, isSelfClaim: false, alreadyClaimed: false },
			{ status: 201 }
		);
	} catch (err) {
		console.error('Claim shared course error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message === 'SHARE_LINK_NOT_FOUND') {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Shared course link not found' } },
				{ status: 404 }
			);
		}
		if (message === 'SHARE_LINK_REVOKED') {
			return json(
				{ error: { code: 'REVOKED', message: 'This shared course link has been revoked' } },
				{ status: 410 }
			);
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
