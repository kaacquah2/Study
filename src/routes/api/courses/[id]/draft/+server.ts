import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';
import { invalidateCachedOutline } from '$lib/server/outlineCache';

const UpdateDraftZod = z.object({
	title: z.string().min(3).max(120),
	description: z.string().max(1000),
	level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
	tags: z.array(z.string()).optional(),
	modules: z
		.array(
			z.object({
				id: z.string().optional(),
				order: z.number(),
				type: z.enum(['lesson', 'quiz']),
				title: z.string().min(2).max(120),
				summary: z.string().max(500),
				learningObjective: z.string().optional(),
				keyPoints: z.array(z.string()).optional(),
				estimatedMinutes: z.number().optional()
			})
		)
		.min(1)
		.max(6)
});

// PATCH /api/courses/[id]/draft - Save edited draft outline
export async function PATCH({ params, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = UpdateDraftZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'Validation failed',
						fields: parsed.error.format()
					}
				},
				{ status: 400 }
			);
		}

		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const { title, description, level, tags, modules } = parsed.data;

		await adminDb.runTransaction(async (transaction) => {
			const existingModulesSnap = await transaction.get(courseRef.collection('modules'));

			transaction.update(courseRef, {
				title,
				description,
				level: level || courseData?.level || 'intermediate',
				tags: tags || courseData?.tags || [],
				moduleCount: modules.length,
				'progress.total': modules.length,
				updatedAt: FieldValue.serverTimestamp()
			});

			// Delete existing modules that are no longer in the provided list
			const keepIds = new Set(modules.map((m) => m.id).filter(Boolean));

			for (const existingDoc of existingModulesSnap.docs) {
				if (!keepIds.has(existingDoc.id)) {
					transaction.delete(existingDoc.ref);
				}
			}

			// Update or insert modules
			for (const mod of modules) {
				const modRef = mod.id
					? courseRef.collection('modules').doc(mod.id)
					: courseRef.collection('modules').doc();

				transaction.set(
					modRef,
					{
						id: modRef.id,
						order: mod.order,
						type: mod.type,
						title: mod.title,
						summary: mod.summary,
						learningObjective: mod.learningObjective || mod.summary,
						keyPoints: mod.keyPoints || [],
						estimatedMinutes: mod.estimatedMinutes || 12,
						status: 'pending',
						attempts: 0,
						error: null
					},
					{ merge: true }
				);
			}
		});

		invalidateCachedOutline(courseId);

		return json({ status: 'draft', message: 'Draft outline updated successfully' });
	} catch (err) {
		console.error('Update draft API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to update draft' } },
			{ status: 500 }
		);
	}
}

// POST /api/courses/[id]/draft - Confirm draft and start full course generation
export async function POST({ params, request, url }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		// Update course status to "building"
		await courseRef.update({
			status: 'building',
			updatedAt: FieldValue.serverTimestamp()
		});

		// Fetch all modules for generation
		const modulesSnap = await courseRef.collection('modules').orderBy('order', 'asc').get();
		const moduleIds = modulesSnap.docs.map((doc) => doc.id);

		// Trigger background module generation server-side
		const authHeader = request.headers.get('Authorization');
		const internalKey = process.env.ML_BACKEND_API_KEY || '';
		const origin = url.origin;

		(async () => {
			if (moduleIds.length === 0) return;

			const makeHeaders = () => {
				const h: Record<string, string> = { 'Content-Type': 'application/json' };
				if (authHeader) h['Authorization'] = authHeader;
				if (internalKey) {
					h['X-Internal-Service-Key'] = internalKey;
					h['X-Internal-User-UID'] = user.uid;
				}
				return h;
			};

			// Step 1: Prioritize Module 1 completion first so user can start reading immediately
			const firstModId = moduleIds[0];
			try {
				await fetch(`${origin}/api/modules/${firstModId}/generate`, {
					method: 'POST',
					headers: makeHeaders(),
					body: JSON.stringify({ courseId })
				});
			} catch (e) {
				console.error(`[Background Generator] Prioritized Module 1 error:`, e);
			}

			// Step 2: Trigger remaining modules concurrently
			const remainingIds = moduleIds.slice(1);
			await Promise.all(
				remainingIds.map((modId) =>
					fetch(`${origin}/api/modules/${modId}/generate`, {
						method: 'POST',
						headers: makeHeaders(),
						body: JSON.stringify({ courseId })
					}).catch((e) => console.error(`[Background Generator] Module ${modId} error:`, e))
				)
			);
		})().catch((err) => console.error('[Background Generator] Orchestration error:', err));

		return json({
			status: 'building',
			courseId,
			moduleIds,
			message: 'Course confirmed. Module generation dispatched.'
		});
	} catch (err) {
		console.error('Confirm draft API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Failed to confirm course draft' } },
			{ status: 500 }
		);
	}
}
