import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';
import { enqueueGenerationJob } from '$lib/server/ai/generationQueue';
import { recordAttributionMetadata } from '$lib/server/ai/providerStats';
import { moderateInput } from '$lib/server/ai/moderation';
import { z } from 'zod';
import { MLBackendError } from '$lib/server/ai/client';

const CreateCourseZod = z.object({
	topic: z.string().min(3).max(120),
	moduleCount: z.number().int().min(3).max(6),
	format: z.enum(['lessons_and_quizzes', 'quizzes_only']),
	referenceText: z.string().max(15000).optional(),
	level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
	goal: z.string().optional(),
	tags: z.array(z.string()).optional(),
	estimatedMinutes: z.number().optional()
});

function sanitizePromptInput(text?: string): string | undefined {
	if (!text) return undefined;
	return (
		text
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') // remove control chars
			.replace(/system:/gi, '')
			.replace(/assistant:/gi, '')
			.replace(/user:/gi, '')
			.replace(/ignore (previous|above|all|instructions)/gi, '')
			.replace(/<\/?[a-z][^>]*>/gi, '')
			.trim()
	);
}

// POST /api/courses
export const POST: RequestHandler = async ({ request }) => {
	try {
		// 1. Verify User Session
		const user = await verifySessionUser(request);

		// 2. Parse and Validate Request Body
		const body = await request.json();
		const parsed = CreateCourseZod.safeParse(body);
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

		const {
			topic,
			moduleCount,
			format,
			referenceText,
			level = 'intermediate',
			goal = 'curiosity',
			tags = [],
			estimatedMinutes
		} = parsed.data;

		const cleanTopic = sanitizePromptInput(topic) || topic;
		const cleanRefText = sanitizePromptInput(referenceText);

		// 3. Pre-generation Content Moderation Gate
		const moderation = moderateInput(cleanTopic, cleanRefText);
		if (!moderation.safe) {
			return json(
				{
					error: {
						code: 'MODERATION_BLOCKED',
						message:
							moderation.reason ||
							'This topic violates content safety guidelines. Please enter a standard educational topic.'
					}
				},
				{ status: 400 }
			);
		}

		// 4. Rate-limiting Pre-check BEFORE expensive AI model generation
		const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		const usageRef = adminDb.collection('usage').doc(user.uid);
		const usageDoc = await usageRef.get();

		if (usageDoc.exists) {
			const usageData = usageDoc.data();
			if (usageData?.day === todayStr && (usageData?.coursesToday || 0) >= 10) {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message: 'Daily course creation limit reached (10 courses per day).'
						}
					},
					{ status: 429 }
				);
			}
		}

		// 5. Generate Outline using confidence-routed AI provider
		let outline;
		let servingProvider: 'ml_backend' | 'gemini' | 'ollama' = 'ml_backend';
		let domainConfidenceScore: number | undefined;

		try {
			const outlineRes = await generateOutline(
				cleanTopic,
				moduleCount,
				format,
				cleanRefText,
				user.uid
			);
			outline = outlineRes.result;
			servingProvider = outlineRes.provider;
			domainConfidenceScore = outlineRes.domainConfidenceScore;
		} catch (e) {
			console.error('Error generating course outline:', e);
			const message = e instanceof Error ? e.message : 'Unknown error';

			const isRateLimitedOrBusy =
				message.includes('429') ||
				message.includes('RESOURCE_EXHAUSTED') ||
				message.includes('rate limit') ||
				message.includes('currently unavailable');

			if (isRateLimitedOrBusy && process.env.NODE_ENV !== 'test') {
				const queuedJob = await enqueueGenerationJob({
					userId: user.uid,
					courseId: `course_${Date.now()}`,
					topic: cleanTopic
				});

				return json(
					{
						status: 'queued',
						jobId: queuedJob.jobId,
						message:
							'High demand detected. Your course generation has been queued and will complete in the background.'
					},
					{ status: 202 }
				);
			}

			return json(
				{
					error: {
						code: 'AI_GENERATION_FAILED',
						message: `Failed to construct outline: ${message}`
					}
				},
				{ status: 500 }
			);
		}

		const courseRef = adminDb.collection('courses').doc();
		const courseId = courseRef.id;

		const totalEstMinutes = estimatedMinutes || moduleCount * 12;
		const courseTags = tags.length > 0 ? tags : [topic.split(' ')[0], level];

		// 4. Rate-limiting & Skeletal writes in a single Firestore Transaction
		await adminDb.runTransaction(async (transaction) => {
			// Check Rate Limit
			const usageDoc = await transaction.get(usageRef);
			let coursesToday = 0;

			if (usageDoc.exists) {
				const usageData = usageDoc.data();
				if (usageData?.day === todayStr) {
					coursesToday = usageData.coursesToday || 0;
				}
			}

			if (coursesToday >= 10) {
				throw new Error('RATE_LIMIT_EXCEEDED');
			}

			// Update Usage Counters
			transaction.set(
				usageRef,
				{
					coursesToday: coursesToday + 1,
					day: todayStr
				},
				{ merge: true }
			);

			// Write Course Document with status: "draft" (Human-in-the-loop stage)
			const accents = ['violet', 'amber', 'emerald'] as const;
			const accent = accents[Math.floor(Math.random() * accents.length)];

			transaction.set(courseRef, {
				id: courseId,
				ownerUid: user.uid,
				title: outline.title,
				description: outline.description,
				topic: topic,
				format: format,
				moduleCount: moduleCount,
				status: 'draft',
				level: level,
				goal: goal,
				tags: courseTags,
				estimatedMinutes: totalEstMinutes,
				accent: accent,
				progress: { completed: 0, total: moduleCount },
				clonedFrom: null,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp()
			});

			// Write skeleton modules in parallel
			for (const mod of outline.modules) {
				const moduleRef = courseRef.collection('modules').doc();
				transaction.set(moduleRef, {
					id: moduleRef.id,
					order: mod.order,
					type: mod.type,
					title: mod.title,
					summary: mod.summary,
					learningObjective: mod.learningObjective,
					keyPoints: mod.keyPoints,
					estimatedMinutes: 12,
					status: 'pending',
					error: null,
					attempts: 0,
					pages: null,
					questions: null,
					model: servingProvider,
					generatedAt: null,
					tokensIn: 0,
					tokensOut: 0,
					videos: null,
					videosStatus: null,
					videosFetchedAt: null
				});
			}
		});

		// Record provider attribution & domain confidence scores asynchronously
		await recordAttributionMetadata('courses', courseId, {
			servicedByProvider: servingProvider,
			domainConfidenceScore
		});

		return json({ courseId, status: 'draft', outline }, { status: 201 });
	} catch (err) {
		console.error('Create course API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message === 'RATE_LIMIT_EXCEEDED') {
			return json(
				{
					error: {
						code: 'RATE_LIMIT_EXCEEDED',
						message: 'You have reached the maximum of 10 courses created per day.'
					}
				},
				{ status: 429 }
			);
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		if (
			message.includes('PERMISSION_DENIED') ||
			message.includes('Missing or insufficient permissions')
		) {
			return json(
				{
					error: {
						code: 'FIRESTORE_PERMISSION_DENIED',
						message:
							'Firestore access denied. Please set FIREBASE_SERVICE_ACCOUNT in your .env file or enable local Firebase emulators (PUBLIC_FIREBASE_USE_EMULATOR=true).'
					}
				},
				{ status: 500 }
			);
		}
		const clientMessage =
			err instanceof MLBackendError
				? 'Internal AI backend error'
				: message || 'Internal Server Error';
		return json({ error: { code: 'SERVER_ERROR', message: clientMessage } }, { status: 500 });
	}
};
