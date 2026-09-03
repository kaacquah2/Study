import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { enqueueModuleGenerationJob } from '$lib/server/ai/generationQueue';
import { z } from 'zod';
import { handleServerError } from '$lib/server/apiError';

const GenerateModuleZod = z.object({
	courseId: z.string()
});

// POST /api/modules/[id]/generate — Enqueues durable module generation job
export const POST: RequestHandler = async (event) => {
	const { params, request } = event;
	const { id: moduleId } = params;

	try {
		// 1. Verify User Session
		const user = await verifySessionUser(request);

		// 2. Parse Body and Validate
		const bodyData = await request.json();
		const parsed = GenerateModuleZod.safeParse(bodyData);
		if (!parsed.success) {
			console.warn('[modules/[id]/generate POST] Validation failed:', parsed.error.issues);
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'Validation failed'
					}
				},
				{ status: 400 }
			);
		}
		const { courseId } = parsed.data;

		const courseRef = adminDb.collection('courses').doc(courseId);
		const moduleRef = courseRef.collection('modules').doc(moduleId);
		const usageRef = adminDb.collection('usage').doc(user.uid);

		// 3. Enforce Rate Limits & Verify Ownership in a Transaction
		let txAttempts = 0;
		const maxTxAttempts = 3;
		while (txAttempts < maxTxAttempts) {
			try {
				txAttempts++;
				await adminDb.runTransaction(async (transaction) => {
					// (a) Enforce Rate Limit
					const hourStr = Math.floor(Date.now() / 3600000).toString();
					const usageDoc = await transaction.get(usageRef);
					let modulesThisHour = 0;

					if (usageDoc.exists) {
						const usageData = usageDoc.data();
						const usageHour = usageData?.hour || '';
						if (usageHour === hourStr) {
							modulesThisHour = usageData?.modulesThisHour || 0;
						}
					}

					if (modulesThisHour >= 30) {
						throw new Error('RATE_LIMIT_EXCEEDED');
					}

					// (b) Verify Course Exists & Ownership
					const courseDoc = await transaction.get(courseRef);
					if (!courseDoc.exists) {
						throw new Error('COURSE_NOT_FOUND');
					}
					const courseData = courseDoc.data();
					if (!courseData || courseData.ownerUid !== user.uid) {
						throw new Error('FORBIDDEN');
					}

					// (c) Verify Module Exists
					const moduleDoc = await transaction.get(moduleRef);
					if (!moduleDoc.exists) {
						throw new Error('MODULE_NOT_FOUND');
					}

					// Set module status to pending and increment usage counter
					transaction.set(
						moduleRef,
						{
							status: 'pending',
							error: null
						},
						{ merge: true }
					);

					transaction.set(
						usageRef,
						{
							modulesThisHour: modulesThisHour + 1,
							hour: hourStr
						},
						{ merge: true }
					);
				});
				break;
			} catch (txErr) {
				const txMsg = txErr instanceof Error ? txErr.message : String(txErr);
				if (
					(txMsg.includes('10 ABORTED') || txMsg.includes('cross-transaction contention')) &&
					txAttempts < maxTxAttempts
				) {
					await new Promise((r) => setTimeout(r, txAttempts * 200));
					continue;
				}
				throw txErr;
			}
		}

		// 4. Enqueue durable background generation job
		const job = await enqueueModuleGenerationJob({
			courseId,
			moduleId,
			userId: user.uid
		});

		return json(
			{
				status: 'queued',
				jobId: job.jobId,
				message: 'Module generation queued successfully'
			},
			{ status: 202 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message === 'RATE_LIMIT_EXCEEDED') {
			return json(
				{
					error: {
						code: 'RATE_LIMIT_EXCEEDED',
						message: 'You have reached the limit of 30 module generations per hour.'
					}
				},
				{ status: 429 }
			);
		}
		if (message.includes('10 ABORTED') || message.includes('cross-transaction contention')) {
			return json(
				{
					error: {
						code: 'CONCURRENT_REQUEST',
						message: 'A concurrent generation request is already in progress. Please retry.'
					}
				},
				{ status: 409 }
			);
		}
		if (message === 'MODULE_NOT_FOUND') {
			return json({ error: { code: 'NOT_FOUND', message: 'Module not found' } }, { status: 404 });
		}
		if (message === 'COURSE_NOT_FOUND') {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}
		if (message === 'FORBIDDEN') {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You do not own this course' } },
				{ status: 403 }
			);
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}

		return handleServerError(err, event);
	}
};
