import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';
import { z } from 'zod';

const RegenerateModuleZod = z.object({
	moduleIndex: z.number().int().min(0),
	currentModules: z.array(
		z.object({
			order: z.number(),
			type: z.enum(['lesson', 'quiz']),
			title: z.string(),
			summary: z.string()
		})
	)
});

// POST /api/courses/[id]/draft/regenerate-module
export async function POST({ params, request }) {
	const { id: courseId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = RegenerateModuleZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Validation failed' } },
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

		const { moduleIndex, currentModules } = parsed.data;
		const targetModule = currentModules[moduleIndex];

		// Ask AI to generate an alternative module outline for this specific order index
		const contextPrompt = `Course Subject: "${courseData?.topic || 'General Study'}"
Overall Course Title: "${courseData?.title || ''}"
Surrounding Modules Context: ${currentModules.map((m, i) => `Module ${i + 1}: ${m.title}`).join(', ')}

Please generate 1 fresh, distinct module to replace Module ${moduleIndex + 1} (${targetModule ? targetModule.title : 'Current topic'}). Make it engaging and complementary.`;

		const res = await generateOutline(
			contextPrompt,
			3,
			courseData?.format || 'lessons_and_quizzes'
		);
		const newMod = res.result.modules[0];

		const updatedModule = {
			order: moduleIndex + 1,
			type: targetModule ? targetModule.type : newMod.type,
			title: newMod.title,
			summary: newMod.summary,
			learningObjective: newMod.learningObjective || newMod.summary,
			keyPoints: newMod.keyPoints || []
		};

		return json({
			status: 'success',
			module: updatedModule,
			provider: res.provider
		});
	} catch (err) {
		console.error('Regenerate module API error:', err);
		const message = err instanceof Error ? err.message : 'Failed to regenerate module';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
