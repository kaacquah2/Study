import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { summarize } from '$lib/server/ai/provider';

// POST /api/courses/[id]/consistency-check
export const POST: RequestHandler = async ({ params, request }) => {
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

		const modulesSnap = await courseRef.collection('modules').orderBy('order', 'asc').get();
		const modules = modulesSnap.docs.map((d) => d.data());

		// Concatenate summaries into a single context block
		const fullText = modules.map((m, i) => `Module ${i + 1} (${m.title}): ${m.summary}`).join('\n');

		// Perform consistency audit using summarize/utility pass
		const auditRes = await summarize(
			`Course: ${courseData.title}\n\nModules overview:\n${fullText}\n\nPerform a quick audit of consistency across modules.`,
			120,
			30
		);

		await courseRef.update({
			consistencyChecked: true,
			consistencyNotes: auditRes.result,
			updatedAt: FieldValue.serverTimestamp()
		});

		return json({
			status: 'checked',
			notes: auditRes.result
		});
	} catch (err) {
		console.error('Consistency check error:', err);
		const message = err instanceof Error ? err.message : 'Consistency check failed';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
