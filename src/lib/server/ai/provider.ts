/**
 * AI Provider — Dual-provider architecture (Gemini Primary, ML Backend Fallback)
 *
 * All AI inference prioritizes Google Gemini for high quality and speed.
 * If Gemini quota safety margins are reached or Gemini returns an error,
 * calls automatically fall back to our self-hosted Python FastAPI ML server (ml_backend).
 *
 * Shared context retrieval (RAG) occurs before provider invocation so responses
 * are grounded identically across both providers.
 */

import { z } from 'zod';
import { callML, pingMLBackend } from './client';
import {
	generateOutlineViaGemini,
	generateLessonViaGemini,
	generateQuizViaGemini,
	chatViaGemini,
	summarizeViaGemini,
	paraphraseViaGemini,
	enhanceTopicViaGemini
} from './gemini';
import {
	pingOllama,
	generateOutlineViaOllama,
	generateLessonViaOllama,
	generateQuizViaOllama,
	chatViaOllama,
	summarizeViaOllama,
	paraphraseViaOllama
} from './ollama';
import { recordProviderUsage, isGeminiQuotaAvailable, type AIProvider } from './providerStats';
import { classifyTopicDomain, logTopicGap } from './domainClassifier';

export type { AIProvider };

export interface AIResult<T> {
	result: T;
	provider: AIProvider;
	domainConfidenceScore?: number;
}

// ── TypeScript interfaces ──────────────────────────────────────────────────────

export interface CourseOutline {
	title: string;
	description: string;
	modules: Array<{
		order: number;
		type: 'lesson' | 'quiz';
		title: string;
		summary: string;
		learningObjective: string;
		keyPoints: string[];
	}>;
}

export interface LessonPage {
	order: number;
	heading: string;
	subheading: string | null;
	body: string;
}

export interface LessonContent {
	pages: LessonPage[];
}

export interface QuizQuestion {
	order: number;
	prompt: string;
	options: string[];
	correctIndex: number;
	explanation: string;
}

export interface QuizContent {
	questions: QuizQuestion[];
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface ChatSource {
	moduleId: string;
	pageTitle: string;
}

export interface ChatResult {
	reply: string;
	sources?: ChatSource[];
}

// ── Zod validation schemas (kept for runtime safety across both providers) ──

const OutlineZodSchema = z.object({
	title: z.string().max(200),
	description: z.string().max(500),
	modules: z
		.array(
			z.object({
				order: z.number().int(),
				type: z.enum(['lesson', 'quiz']),
				title: z.string().max(200),
				summary: z.string().max(300),
				learning_objective: z.string(),
				key_points: z.array(z.string()).min(1).max(10)
			})
		)
		.min(3)
		.max(6)
});

const LessonZodSchema = z.object({
	pages: z
		.array(
			z.object({
				order: z.number().int(),
				heading: z.string().max(200),
				subheading: z.string().max(200).nullable().optional(),
				body: z.string()
			})
		)
		.min(1)
		.max(10)
});

const QuizZodSchema = z.object({
	questions: z
		.array(
			z.object({
				order: z.number().int(),
				prompt: z.string(),
				options: z.array(z.string()).length(4),
				correct_index: z.number().int().min(0).max(3),
				explanation: z.string()
			})
		)
		.min(1)
		.max(6)
});

// ── Helper for Lock-Aware Routing & Provider Tracking ───────────────────────

let cachedPing: { result: Awaited<ReturnType<typeof pingMLBackend>>; timestamp: number } | null =
	null;

async function getCachedPing() {
	if (process.env.NODE_ENV === 'test') {
		return pingMLBackend(3_000);
	}
	const now = Date.now();
	if (cachedPing && now - cachedPing.timestamp < 3_000) {
		return cachedPing.result;
	}
	const result = await pingMLBackend(3_000);
	cachedPing = { result, timestamp: now };
	return result;
}

async function executeAI<T>(
	mlFn: () => Promise<T>,
	geminiFn: () => Promise<T>,
	ollamaFn?: () => Promise<T>,
	taskType: 'reasoning' | 'utility' = 'reasoning',
	topicHint: string = ''
): Promise<AIResult<T>> {
	const enableConfidenceRouting = process.env.ENABLE_CONFIDENCE_ROUTING !== 'false';

	if (taskType === 'reasoning') {
		const classification = classifyTopicDomain(topicHint);
		const { inDomain, confidence } = classification;

		if (!inDomain && topicHint) {
			// Log topic gap asynchronously for future training set collection
			logTopicGap(topicHint, confidence);
		}

		if (enableConfidenceRouting && inDomain) {
			// ── IN-DOMAIN CS ROUTING: T1 ml_backend (fine-tuned), T2 Gemini, T3 Ollama ──
			const ping = await getCachedPing();
			if (ping.available && !ping.busy) {
				try {
					const result = await mlFn();
					await recordProviderUsage('ml_backend');
					return { result, provider: 'ml_backend', domainConfidenceScore: confidence };
				} catch (mlErr) {
					console.warn(
						'[executeAI] In-domain Tier 1 ml_backend failed, fallback to Gemini:',
						mlErr
					);
				}
			}

			// T2 Gemini Flash
			const quotaAvailable = await isGeminiQuotaAvailable();
			if (quotaAvailable) {
				try {
					const result = await geminiFn();
					await recordProviderUsage('gemini');
					return { result, provider: 'gemini', domainConfidenceScore: confidence };
				} catch (geminiErr) {
					console.warn(
						'[executeAI] In-domain Tier 2 Gemini failed, fallback to Ollama:',
						geminiErr
					);
				}
			}

			// T3 Ollama
			if (ollamaFn) {
				const ollamaStatus = await pingOllama();
				if (ollamaStatus.available) {
					try {
						const result = await ollamaFn();
						await recordProviderUsage('ollama');
						return { result, provider: 'ollama', domainConfidenceScore: confidence };
					} catch (ollamaErr) {
						console.warn('[executeAI] In-domain Tier 3 Ollama failed:', ollamaErr);
					}
				}
			}
		} else {
			// ── OUT-OF-DOMAIN ROUTING: T1 Gemini Flash, T2 Ollama, T3 ml_backend ──
			const quotaAvailable = await isGeminiQuotaAvailable();
			if (quotaAvailable) {
				try {
					const result = await geminiFn();
					await recordProviderUsage('gemini');
					return { result, provider: 'gemini', domainConfidenceScore: confidence };
				} catch (geminiErr) {
					console.warn(
						'[executeAI] Out-of-domain Tier 1 Gemini failed, fallback to Ollama:',
						geminiErr
					);
				}
			}

			if (ollamaFn) {
				const ollamaStatus = await pingOllama();
				if (ollamaStatus.available) {
					try {
						const result = await ollamaFn();
						await recordProviderUsage('ollama');
						return { result, provider: 'ollama', domainConfidenceScore: confidence };
					} catch (ollamaErr) {
						console.warn(
							'[executeAI] Out-of-domain Tier 2 Ollama failed, fallback to ml_backend:',
							ollamaErr
						);
					}
				}
			}

			const ping = await getCachedPing();
			if (ping.available && !ping.busy) {
				try {
					const result = await mlFn();
					await recordProviderUsage('ml_backend');
					return { result, provider: 'ml_backend', domainConfidenceScore: confidence };
				} catch (mlErr) {
					console.warn('[executeAI] Out-of-domain Tier 3 ml_backend failed:', mlErr);
				}
			}
		}

		throw new Error('All AI providers (gemini, ollama, ml_backend) are currently unavailable.');
	} else {
		// Tier 1 for utility tasks (summarize, paraphrase): Self-hosted ML Backend
		const ping = await getCachedPing();
		if (ping.available && !ping.busy) {
			try {
				const result = await mlFn();
				await recordProviderUsage('ml_backend');
				return { result, provider: 'ml_backend' };
			} catch (mlErr) {
				console.warn('[executeAI] Tier 1 ml_backend utility failed, attempting fallback:', mlErr);
			}
		}

		if (ollamaFn) {
			const ollamaStatus = await pingOllama();
			if (ollamaStatus.available) {
				try {
					const result = await ollamaFn();
					await recordProviderUsage('ollama');
					return { result, provider: 'ollama' };
				} catch (ollamaErr) {
					console.warn(
						'[executeAI] Tier 2 Ollama utility failed, attempting Gemini fallback:',
						ollamaErr
					);
				}
			}
		}

		const quotaAvailable = await isGeminiQuotaAvailable();
		if (quotaAvailable) {
			try {
				const result = await geminiFn();
				await recordProviderUsage('gemini');
				return { result, provider: 'gemini' };
			} catch (geminiErr) {
				console.warn('[executeAI] Tier 3 Gemini utility failed:', geminiErr);
			}
		}

		throw new Error('All AI providers (ml_backend, ollama, gemini) are currently unavailable.');
	}
}

// ── Course Outline Generation ─────────────────────────────────────────────────

export async function generateOutline(
	topic: string,
	moduleCount: number,
	format: 'lessons_and_quizzes' | 'quizzes_only',
	referenceText?: string
): Promise<AIResult<CourseOutline>> {
	const parseOutline = (raw: unknown): CourseOutline => {
		const parsed = OutlineZodSchema.parse(raw);
		return {
			title: parsed.title,
			description: parsed.description,
			modules: parsed.modules.map((m) => ({
				order: m.order,
				type: m.type,
				title: m.title,
				summary: m.summary,
				learningObjective: m.learning_objective,
				keyPoints: m.key_points
			}))
		};
	};

	return executeAI(
		async () => {
			const response = await callML<unknown>(
				'/outline',
				{
					topic,
					module_count: moduleCount,
					format,
					reference_text: referenceText ?? null
				},
				90_000
			);
			return parseOutline(response);
		},
		async () => {
			const response = await generateOutlineViaGemini(topic, moduleCount, format, referenceText);
			return parseOutline(response);
		},
		async () => {
			const response = await generateOutlineViaOllama(topic, moduleCount, format, referenceText);
			return parseOutline(response);
		},
		'reasoning',
		topic
	);
}

// ── Lesson Content Generation ─────────────────────────────────────────────────

export async function generateLesson(
	courseTitle: string,
	fullOutline: CourseOutline,
	moduleTitle: string,
	moduleObjective: string,
	keyPoints: string[]
): Promise<AIResult<LessonContent>> {
	const parseLesson = (raw: unknown): LessonContent => {
		const parsed = LessonZodSchema.parse(raw);
		return {
			pages: parsed.pages.map((p) => ({
				order: p.order,
				heading: p.heading,
				subheading: p.subheading ?? null,
				body: p.body
			}))
		};
	};

	const safeCourseTitle = (courseTitle || 'Untitled Course').slice(0, 500);
	const safeModuleTitle = (moduleTitle || 'Overview').slice(0, 500);
	const safeObjective = (moduleObjective || safeModuleTitle).slice(0, 2000);
	const safeKeyPoints =
		keyPoints && keyPoints.filter((k) => k.trim()).length > 0
			? keyPoints.filter((k) => k.trim())
			: [safeModuleTitle];

	return executeAI(
		async () => {
			const response = await callML<unknown>(
				'/lesson',
				{
					course_title: safeCourseTitle,
					module_title: safeModuleTitle,
					learning_objective: safeObjective,
					key_points: safeKeyPoints,
					course_outline: fullOutline.modules.map((m) => ({
						title: m.title,
						type: m.type
					}))
				},
				120_000
			);
			return parseLesson(response);
		},
		async () => {
			const response = await generateLessonViaGemini(
				safeCourseTitle,
				fullOutline,
				safeModuleTitle,
				safeObjective,
				safeKeyPoints
			);
			return parseLesson(response);
		},
		async () => {
			const response = await generateLessonViaOllama(
				safeCourseTitle,
				safeModuleTitle,
				safeObjective,
				safeKeyPoints
			);
			return parseLesson(response);
		},
		'reasoning',
		`${safeCourseTitle} ${safeModuleTitle}`
	);
}

// ── Quiz Generation ───────────────────────────────────────────────────────────

export async function generateQuiz(
	courseTitle: string,
	fullOutline: CourseOutline,
	moduleTitle: string,
	moduleObjective: string,
	keyPoints: string[]
): Promise<AIResult<QuizContent>> {
	const parseQuiz = (raw: unknown): QuizContent => {
		const parsed = QuizZodSchema.parse(raw);
		return {
			questions: parsed.questions.map((q) => ({
				order: q.order,
				prompt: q.prompt,
				options: q.options,
				correctIndex: q.correct_index,
				explanation: q.explanation
			}))
		};
	};

	const safeCourseTitle = (courseTitle || 'Untitled Course').slice(0, 500);
	const safeModuleTitle = (moduleTitle || 'Overview').slice(0, 500);
	const safeObjective = (moduleObjective || safeModuleTitle).slice(0, 2000);
	const safeKeyPoints =
		keyPoints && keyPoints.filter((k) => k.trim()).length > 0
			? keyPoints.filter((k) => k.trim())
			: [safeModuleTitle];

	return executeAI(
		async () => {
			const response = await callML<unknown>(
				'/quiz',
				{
					course_title: safeCourseTitle,
					module_title: safeModuleTitle,
					learning_objective: safeObjective,
					key_points: safeKeyPoints,
					lesson_body: null
				},
				120_000
			);
			return parseQuiz(response);
		},
		async () => {
			const response = await generateQuizViaGemini(
				courseTitle,
				fullOutline,
				moduleTitle,
				moduleObjective,
				safeKeyPoints
			);
			return parseQuiz(response);
		},
		async () => {
			const response = await generateQuizViaOllama(moduleTitle, moduleObjective, safeKeyPoints);
			return parseQuiz(response);
		},
		'reasoning',
		`${courseTitle} ${moduleTitle}`
	);
}

// ── Summarization ─────────────────────────────────────────────────────────────

export async function summarize(
	text: string,
	maxLength = 150,
	minLength = 40
): Promise<AIResult<string>> {
	return executeAI(
		async () => {
			const response = await callML<{ summary: string }>('/summarize', {
				text,
				max_length: maxLength,
				min_length: minLength
			});
			return response.summary;
		},
		async () => {
			const response = await summarizeViaGemini(text, maxLength, minLength);
			return response.summary;
		},
		async () => {
			const response = await summarizeViaOllama(text);
			return response.summary;
		},
		'utility'
	);
}

// ── Paraphrasing ──────────────────────────────────────────────────────────────

export async function paraphrase(
	text: string,
	style: 'academic' | 'simple' | 'formal' = 'academic'
): Promise<AIResult<string>> {
	return executeAI(
		async () => {
			const response = await callML<{ paraphrase: string }>('/paraphrase', { text, style });
			return response.paraphrase;
		},
		async () => {
			const response = await paraphraseViaGemini(text, style);
			return response.paraphrase;
		},
		async () => {
			const response = await paraphraseViaOllama(text, style);
			return response.paraphrased;
		},
		'utility'
	);
}

// ── AI Study Assistant Chat ───────────────────────────────────────────────────

export async function chat(
	messages: ChatMessage[],
	courseContext?: string
): Promise<AIResult<ChatResult>> {
	return executeAI(
		async () => {
			const response = await callML<{ reply: string; sources?: ChatSource[] }>(
				'/chat',
				{
					messages,
					course_context: courseContext ?? null
				},
				180_000
			);
			return {
				reply: response.reply,
				sources: response.sources || []
			};
		},
		async () => {
			const response = await chatViaGemini(messages, courseContext);
			return {
				reply: response.reply,
				sources: response.sources || []
			};
		},
		async () => {
			const response = await chatViaOllama(messages, courseContext);
			return {
				reply: response.reply,
				sources: response.sources || []
			};
		},
		'reasoning'
	);
}

// ── Enhance Topic ─────────────────────────────────────────────────────────────

export async function enhanceTopic(
	topic: string
): Promise<AIResult<{ enhancedTopic: string; suggestions: string[] }>> {
	return executeAI(
		async () => {
			const response = await enhanceTopicViaGemini(topic);
			return response;
		},
		async () => {
			const response = await enhanceTopicViaGemini(topic);
			return response;
		},
		undefined,
		'reasoning'
	);
}
