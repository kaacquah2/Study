import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateLesson, generateQuiz } from '$lib/server/ai/provider';
import { checkMemorization } from '$lib/server/ai/memorizationGuard';
import { recordAttributionMetadata } from '$lib/server/ai/providerStats';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import { MLBackendError } from '$lib/server/ai/client';
import { getCachedOutline } from '$lib/server/outlineCache';

const GenerateModuleZod = z.object({
	courseId: z.string()
});

export const POST: RequestHandler = async ({ params, request }) => {
	const { id: moduleId } = params;

	try {
		// 1. Verify User Session
		const user = await verifySessionUser(request);

		// 2. Parse Body and Validate
		const bodyData = await request.json();
		const parsed = GenerateModuleZod.safeParse(bodyData);
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
		const { courseId } = parsed.data;

		const courseRef = adminDb.collection('courses').doc(courseId);
		const moduleRef = courseRef.collection('modules').doc(moduleId);
		const usageRef = adminDb.collection('usage').doc(user.uid);

		// 3. Enforce Rate Limits & Idempotency Lock in a Transaction
		const moduleState = await adminDb.runTransaction(async (transaction) => {
			// (a) Enforce Rate Limit
			const hourStr = Math.floor(Date.now() / 3600000).toString(); // Hour index
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

			// (b) Fetch Course context inside transaction to verify ownership before modifying anything
			const courseDoc = await transaction.get(courseRef);
			if (!courseDoc.exists) {
				throw new Error('COURSE_NOT_FOUND');
			}
			const courseData = courseDoc.data();
			if (courseData?.ownerUid !== user.uid) {
				throw new Error('FORBIDDEN');
			}

			// (c) Read module state to ensure idempotency
			const moduleDoc = await transaction.get(moduleRef);
			if (!moduleDoc.exists) {
				throw new Error('MODULE_NOT_FOUND');
			}

			const moduleData = moduleDoc.data();
			if (moduleData?.status === 'generating' || moduleData?.status === 'ready') {
				return { shouldGenerate: false, data: moduleData, courseData };
			}

			// Lock the module for generation and increment attempts
			const idempotencyKey = request.headers.get('x-idempotency-key') || null;
			const attempts = (moduleData?.attempts || 0) + 1;
			transaction.update(moduleRef, {
				status: 'generating',
				idempotencyKey: idempotencyKey || moduleData?.idempotencyKey || null,
				attempts: attempts
			});

			// Update hourly limit counters
			transaction.set(
				usageRef,
				{
					modulesThisHour: modulesThisHour + 1,
					hour: hourStr
				},
				{ merge: true }
			);

			return { shouldGenerate: true, data: { ...moduleData, attempts }, courseData };
		});

		if (!moduleState.shouldGenerate) {
			return json({
				status: moduleState.data.status,
				message: 'Module is already building or ready'
			});
		}

		const moduleData = moduleState.data;
		const courseData = moduleState.courseData;

		// Read full outline of modules to prevent content overlap (cached to prevent duplicate concurrent queries)
		const outlineModules = await getCachedOutline(courseId, async () => {
			const modulesSnapshot = await courseRef.collection('modules').orderBy('order', 'asc').get();
			return modulesSnapshot.docs.map((doc) => {
				const data = doc.data();
				return {
					order: data.order,
					type: data.type,
					title: data.title,
					summary: data.summary,
					learningObjective: data.learningObjective || '',
					keyPoints: data.keyPoints || []
				};
			});
		});

		const courseOutline = {
			title: courseData.title,
			description: courseData.description,
			modules: outlineModules
		};

		// 4. Generate content using ML backend (Flan-T5)
		try {
			if (moduleData.type === 'lesson') {
				const { result, provider } = await generateLesson(
					courseOutline.title,
					courseOutline,
					moduleData.title,
					moduleData.learningObjective || '',
					moduleData.keyPoints || [],
					user.uid
				);

				// Sanitize and validate markdown content on write
				const pages = result.pages.map((page) => {
					const body = page.body;

					// Reject prohibited elements
					if (body.includes('<img') || body.includes('![') || body.includes('<iframe')) {
						throw new Error(
							'Security policy violation: Lesson pages cannot contain images or iframe embeds.'
						);
					}
					if (
						body.includes('http://') ||
						body.includes('https://') ||
						/\[.*?\]\(.*?\)/.test(body)
					) {
						throw new Error(
							'Security policy violation: Lesson pages cannot contain external links.'
						);
					}
					if (/(^|\n)#\s/.test(body) || body.includes('<h1>')) {
						throw new Error(
							'Security policy violation: Lesson pages cannot contain H1 heading tags.'
						);
					}

					// HTML sanitize page body to guarantee XSS safety
					const cleanBody = DOMPurify.sanitize(body);

					return {
						order: page.order,
						heading: page.heading,
						subheading: page.subheading,
						body: cleanBody
					};
				});

				// Calculate dynamic duration from actual word count (200 wpm average reading speed)
				const totalWords = pages.reduce(
					(acc, p) => acc + (p.body ? p.body.split(/\s+/).filter(Boolean).length : 0),
					0
				);
				const estMinutes = Math.max(2, Math.ceil(totalWords / 200));

				// Memorization / verbatim overlap check against reference material
				const fullLessonText = pages.map((p) => `${p.heading} ${p.body}`).join('\n');
				const memCheck = checkMemorization(fullLessonText, courseData?.referenceText);

				// Write lesson pages to database
				await moduleRef.update({
					pages: pages,
					estimatedMinutes: estMinutes,
					status: 'ready',
					model: provider,
					verbatimSimilarityScore: memCheck.verbatimSimilarityScore,
					generatedAt: FieldValue.serverTimestamp(),
					error: null
				});

				await recordAttributionMetadata('modules', moduleId, {
					servicedByProvider: provider,
					verbatimSimilarityScore: memCheck.verbatimSimilarityScore
				});
			} else if (moduleData.type === 'quiz') {
				const { result, provider } = await generateQuiz(
					courseOutline.title,
					courseOutline,
					moduleData.title,
					moduleData.learningObjective || '',
					moduleData.keyPoints || [],
					user.uid
				);

				// Pre-save Quality Guardrail Validation
				for (const q of result.questions) {
					if (!q.prompt || typeof q.prompt !== 'string' || q.prompt.trim().length === 0) {
						throw new Error('Quality validation error: Quiz question prompt cannot be empty.');
					}
					if (!Array.isArray(q.options) || q.options.length !== 4) {
						throw new Error('Quality validation error: Quiz question must have exactly 4 options.');
					}
					const uniqueOptions = new Set(q.options.map((o) => o.trim().toLowerCase()));
					if (uniqueOptions.size < 4) {
						throw new Error('Quality validation error: Quiz question options must be distinct.');
					}
					if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
						throw new Error(
							'Quality validation error: Quiz correct option index must be between 0 and 3.'
						);
					}
					if (!q.explanation || q.explanation.trim().length < 5) {
						throw new Error('Quality validation error: Quiz explanation is missing or incomplete.');
					}
				}

				// Calculate dynamic duration for quiz (45 seconds per question)
				const estMinutes = Math.max(2, Math.ceil((result.questions.length * 45) / 60));

				// Write quiz questions to database
				await moduleRef.update({
					questions: result.questions,
					estimatedMinutes: estMinutes,
					status: 'ready',
					model: provider,
					generatedAt: FieldValue.serverTimestamp(),
					error: null
				});
			}

			// Check if all modules are ready, update course status & total estimated duration
			const updatedSnapshot = await courseRef.collection('modules').get();
			const modulesData = updatedSnapshot.docs.map((doc) => doc.data());
			const statuses = modulesData.map((m) => m.status);
			const allReady = statuses.every((status) => status === 'ready');
			const anyFailed = statuses.some((status) => status === 'failed');

			const totalCourseEstMinutes = modulesData.reduce(
				(acc, m) => acc + (typeof m.estimatedMinutes === 'number' ? m.estimatedMinutes : 12),
				0
			);

			if (allReady) {
				await courseRef.update({
					status: 'ready',
					estimatedMinutes: totalCourseEstMinutes,
					updatedAt: FieldValue.serverTimestamp()
				});
			} else if (anyFailed) {
				await courseRef.update({
					status: 'partial',
					estimatedMinutes: totalCourseEstMinutes,
					updatedAt: FieldValue.serverTimestamp()
				});
			} else {
				await courseRef.update({
					estimatedMinutes: totalCourseEstMinutes,
					updatedAt: FieldValue.serverTimestamp()
				});
			}

			return json({ status: 'ready', message: 'Module generated successfully' });
		} catch (aiErr) {
			console.error('AI Generation or writing error:', aiErr);
			const message =
				aiErr instanceof MLBackendError
					? 'Failed to generate module content due to an internal AI error.'
					: aiErr instanceof Error
						? aiErr.message
						: 'AI Generation Failed';

			// Handle failure and register attempts
			const statusUpdate = 'failed';
			await moduleRef.update({
				status: statusUpdate,
				error: message
			});

			// Update course status to partial
			await courseRef.update({
				status: 'partial',
				updatedAt: FieldValue.serverTimestamp()
			});

			return json(
				{
					error: {
						code: 'GENERATION_FAILED',
						message:
							aiErr instanceof MLBackendError
								? 'Failed to generate module content due to an internal AI error.'
								: message
					}
				},
				{ status: 500 }
			);
		}
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
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		console.error('Module generate API error:', err);
		const clientMessage =
			err instanceof MLBackendError
				? 'Internal AI backend error'
				: message || 'Internal Server Error';
		return json({ error: { code: 'SERVER_ERROR', message: clientMessage } }, { status: 500 });
	}
};
