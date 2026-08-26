/**
 * Gemini 2.5 Flash Client — Fallback AI Provider
 *
 * Uses Gemini REST API (v1beta generateContent) with structured response schemas
 * (responseMimeType: 'application/json' + responseSchema) so output matches
 * existing SvelteKit Zod schemas without changes downstream.
 */

import { env } from '$env/dynamic/private';

function getGeminiApiKey(): string {
	return env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getGeminiModel(): string {
	return env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

async function callGeminiApi<T>(
	promptOrContents: string | Array<{ role: string; parts: Array<{ text: string }> }>,
	systemInstruction?: string,
	responseSchema?: object,
	timeoutMs = 60_000
): Promise<T> {
	const apiKey = getGeminiApiKey();
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not configured on the server.');
	}

	const model = getGeminiModel();
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

	const generationConfig: Record<string, unknown> = {};
	if (responseSchema) {
		generationConfig.responseMimeType = 'application/json';
		generationConfig.responseSchema = responseSchema;
	} else {
		generationConfig.responseMimeType = 'application/json';
	}

	const contents =
		typeof promptOrContents === 'string'
			? [{ role: 'user', parts: [{ text: promptOrContents }] }]
			: promptOrContents;

	const body: Record<string, unknown> = {
		contents,
		generationConfig
	};

	if (systemInstruction) {
		body.systemInstruction = {
			parts: [{ text: systemInstruction }]
		};
	}

	let res: Response | undefined;
	let lastErr: unknown;
	const maxRetries = 2;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': apiKey
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (res.ok || (res.status >= 400 && res.status < 500)) {
				break;
			}
		} catch (err) {
			lastErr = err;
			if (attempt < maxRetries) {
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
	}

	if (!res) {
		const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
		throw new Error(`Gemini API connection failed: ${msg}`);
	}

	if (!res.ok) {
		let detail: string;
		try {
			const errJson = await res.json();
			detail = errJson?.error?.message || JSON.stringify(errJson);
		} catch {
			detail = await res.text();
		}
		throw new Error(`Gemini API error (HTTP ${res.status}): ${detail}`);
	}

	const json = await res.json();
	const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) {
		throw new Error('Gemini API returned an empty or missing text response candidate.');
	}

	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`Failed to parse Gemini response as JSON: ${text.slice(0, 200)}`);
	}
}

// ── Course Outline via Gemini ──────────────────────────────────────────────────

const OUTLINE_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		title: { type: 'STRING' },
		description: { type: 'STRING' },
		modules: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					order: { type: 'INTEGER' },
					type: { type: 'STRING', enum: ['lesson', 'quiz'] },
					title: { type: 'STRING' },
					summary: { type: 'STRING' },
					learning_objective: { type: 'STRING' },
					key_points: {
						type: 'ARRAY',
						items: { type: 'STRING' }
					}
				},
				required: ['order', 'type', 'title', 'summary', 'learning_objective', 'key_points']
			}
		}
	},
	required: ['title', 'description', 'modules']
};

export async function generateOutlineViaGemini(
	topic: string,
	moduleCount: number,
	format: 'lessons_and_quizzes' | 'quizzes_only',
	referenceText?: string
) {
	const systemInstruction =
		'You are an expert curriculum designer creating high-quality, structured online learning courses.';

	let prompt = `Generate a course outline on the topic "${topic}".\n`;
	prompt += `Number of modules required: ${moduleCount}.\n`;
	prompt += `Course format: ${format === 'quizzes_only' ? 'quizzes only' : 'mix of lessons and quizzes'}.\n`;
	if (referenceText) {
		prompt += `Reference context: ${referenceText}\n`;
	}

	return callGeminiApi<unknown>(prompt, systemInstruction, OUTLINE_RESPONSE_SCHEMA, 60_000);
}

// ── Lesson Content via Gemini ──────────────────────────────────────────────────

const LESSON_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		pages: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					order: { type: 'INTEGER' },
					heading: { type: 'STRING' },
					subheading: { type: 'STRING', nullable: true },
					body: { type: 'STRING' }
				},
				required: ['order', 'heading', 'body']
			}
		}
	},
	required: ['pages']
};

export async function generateLessonViaGemini(
	courseTitle: string,
	fullOutline: unknown,
	moduleTitle: string,
	moduleObjective: string,
	keyPoints: string[]
) {
	const systemInstruction =
		'You are an expert educational content writer creating comprehensive, structured lesson pages in Markdown format. Ensure headings use H2/H3 syntax (do NOT use H1 headings) and avoid image or iframe tags.';

	let prompt = `Course: "${courseTitle}"\n`;
	prompt += `Module: "${moduleTitle}"\n`;
	prompt += `Learning Objective: ${moduleObjective}\n`;
	prompt += `MANDATORY KEY POINTS TO COVER (STRICT CONSTRAINT): ${keyPoints.join('; ')}\n`;
	prompt += `You MUST explicitly cover all of the mandatory key points above across the lesson pages. Do not drift or deviate from these approved key points.\n`;

	return callGeminiApi<unknown>(prompt, systemInstruction, LESSON_RESPONSE_SCHEMA, 60_000);
}

const LESSON_BLOCK_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		pages: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					order: { type: 'INTEGER' },
					heading: { type: 'STRING' },
					subheading: { type: 'STRING', nullable: true },
					blocks: {
						type: 'ARRAY',
						items: {
							type: 'OBJECT',
							properties: {
								type: {
									type: 'STRING',
									enum: [
										'text',
										'callout',
										'diagram',
										'term',
										'check',
										'flashcard',
										'code',
										'mindmap-node'
									]
								},
								markdown: { type: 'STRING', nullable: true },
								style: {
									type: 'STRING',
									enum: ['tip', 'warning', 'example', 'deep-dive'],
									nullable: true
								},
								title: { type: 'STRING', nullable: true },
								mermaid: { type: 'STRING', nullable: true },
								caption: { type: 'STRING', nullable: true },
								term: { type: 'STRING', nullable: true },
								definition: { type: 'STRING', nullable: true },
								prompt: { type: 'STRING', nullable: true },
								options: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
								answerIndex: { type: 'INTEGER', nullable: true },
								explanation: { type: 'STRING', nullable: true },
								front: { type: 'STRING', nullable: true },
								back: { type: 'STRING', nullable: true },
								language: { type: 'STRING', nullable: true },
								code: { type: 'STRING', nullable: true },
								runnable: { type: 'BOOLEAN', nullable: true },
								nodeId: { type: 'STRING', nullable: true },
								label: { type: 'STRING', nullable: true }
							},
							required: ['type']
						}
					}
				},
				required: ['order', 'heading', 'blocks']
			}
		}
	},
	required: ['pages']
};

export async function generateLessonWithBlocksViaGemini(
	courseTitle: string,
	fullOutline: unknown,
	moduleTitle: string,
	moduleObjective: string,
	keyPoints: string[]
) {
	const systemInstruction =
		'You are an expert interactive learning designer. Create structured lesson pages composed of typed blocks. Every 2-3 paragraphs insert one check block. Insert a diagram block (valid Mermaid syntax) wherever a process, hierarchy, or workflow is described. Wrap key technical terms in term blocks for tap-to-reveal definitions. Insert callout blocks for tips and warnings. Do NOT use H1 headings in text block markdown.';

	let prompt = `Course: "${courseTitle}"\n`;
	prompt += `Module: "${moduleTitle}"\n`;
	prompt += `Learning Objective: ${moduleObjective}\n`;
	prompt += `MANDATORY KEY POINTS TO COVER: ${keyPoints.join('; ')}\n`;
	prompt += `Generate interactive, rich structured content blocks covering all key points.\n`;

	return callGeminiApi<unknown>(prompt, systemInstruction, LESSON_BLOCK_RESPONSE_SCHEMA, 60_000);
}

// ── Quiz Generation via Gemini ─────────────────────────────────────────────────

const QUIZ_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		questions: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					order: { type: 'INTEGER' },
					prompt: { type: 'STRING' },
					options: {
						type: 'ARRAY',
						items: { type: 'STRING' }
					},
					correct_index: { type: 'INTEGER' },
					explanation: { type: 'STRING' }
				},
				required: ['order', 'prompt', 'options', 'correct_index', 'explanation']
			}
		}
	},
	required: ['questions']
};

export async function generateQuizViaGemini(
	courseTitle: string,
	fullOutline: unknown,
	moduleTitle: string,
	moduleObjective: string,
	keyPoints: string[]
) {
	const systemInstruction =
		'You are an expert educational assessment creator generating multiple choice quiz questions. Each question must have exactly 4 distinct options and a correct index (0-3).';

	let prompt = `Course: "${courseTitle}"\n`;
	prompt += `Module: "${moduleTitle}"\n`;
	prompt += `Learning Objective: ${moduleObjective}\n`;
	prompt += `MANDATORY KEY POINTS TO ASSESS (STRICT CONSTRAINT): ${keyPoints.join('; ')}\n`;
	prompt += `Every quiz question MUST directly test knowledge of these approved key points.\n`;

	return callGeminiApi<unknown>(prompt, systemInstruction, QUIZ_RESPONSE_SCHEMA, 60_000);
}

// ── Microservices (Summarize, Paraphrase, Chat) via Gemini ─────────────────────

const SUMMARIZE_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		summary: { type: 'STRING' }
	},
	required: ['summary']
};

export async function summarizeViaGemini(text: string, maxLength = 150, minLength = 40) {
	const systemInstruction = `Summarize the user text clearly and concisely between ${minLength} and ${maxLength} words.`;
	return callGeminiApi<{ summary: string }>(
		text,
		systemInstruction,
		SUMMARIZE_RESPONSE_SCHEMA,
		30_000
	);
}

const PARAPHRASE_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		paraphrase: { type: 'STRING' }
	},
	required: ['paraphrase']
};

export async function paraphraseViaGemini(
	text: string,
	style: 'academic' | 'simple' | 'formal' = 'academic'
) {
	const systemInstruction = `Paraphrase the user text in a ${style} tone while preserving key information.`;
	return callGeminiApi<{ paraphrase: string }>(
		text,
		systemInstruction,
		PARAPHRASE_RESPONSE_SCHEMA,
		30_000
	);
}

const CHAT_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		reply: { type: 'STRING' }
	},
	required: ['reply']
};

export async function chatViaGemini(
	messages: Array<{ role: string; content: string }>,
	courseContext?: string
) {
	let systemInstruction =
		'You are an encouraging AI Study Assistant helping students master course materials. Answer concisely, clearly, and with high technical precision (e.g., explicitly distinguishing amortized vs. strict Big-O complexity when relevant). When comparing concepts, algorithms, or data structures, use Markdown comparison tables to highlight key trade-offs.';
	if (courseContext) {
		systemInstruction += `\n\nCourse Context:\n${courseContext}`;
	}

	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }]
	}));

	const result = await callGeminiApi<{ reply: string }>(
		contents,
		systemInstruction,
		CHAT_RESPONSE_SCHEMA,
		45_000
	);

	return {
		reply: result.reply,
		sources: []
	};
}

/**
 * Stream live chat tokens directly from Gemini streaming REST SSE endpoint.
 */
export async function* streamChatViaGemini(
	messages: Array<{ role: string; content: string }>,
	courseContext?: string
): AsyncGenerator<string, void, unknown> {
	const apiKey = getGeminiApiKey();
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not configured on the server.');
	}

	const model = getGeminiModel();
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

	let systemInstruction =
		'You are an encouraging AI Study Assistant helping students master course materials. Answer concisely, clearly, and with high technical precision. When comparing concepts, algorithms, or data structures, use Markdown comparison tables to highlight key trade-offs.';
	if (courseContext) {
		systemInstruction += `\n\nCourse Context:\n${courseContext}`;
	}

	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }]
	}));

	const body: Record<string, unknown> = {
		contents,
		systemInstruction: {
			parts: [{ text: systemInstruction }]
		}
	};

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-goog-api-key': apiKey
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(45_000)
	});

	if (!res.ok || !res.body) {
		const errText = await res.text().catch(() => '');
		throw new Error(`Gemini streaming error ${res.status}: ${errText}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('data: ')) {
				const jsonStr = trimmed.slice(6).trim();
				if (jsonStr && jsonStr !== '[DONE]') {
					try {
						const parsed = JSON.parse(jsonStr);
						const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
						if (text) {
							yield text;
						}
					} catch {
						// Incomplete or non-JSON chunk
					}
				}
			}
		}
	}
}


// ── Enhance Topic via Gemini ───────────────────────────────────────────────────

const ENHANCE_TOPIC_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		enhancedTopic: { type: 'STRING' },
		suggestions: {
			type: 'ARRAY',
			items: { type: 'STRING' }
		}
	},
	required: ['enhancedTopic', 'suggestions']
};

export async function enhanceTopicViaGemini(rawTopic: string) {
	const systemInstruction =
		'You are an expert curriculum consultant. Expand a vague topic into a specific, high-quality, targeted course subject suitable for comprehensive AI course generation. Provide the single best enhanced topic and 3 alternative tailored suggestions.';
	const prompt = `Raw Topic: "${rawTopic}"`;
	return callGeminiApi<{ enhancedTopic: string; suggestions: string[] }>(
		prompt,
		systemInstruction,
		ENHANCE_TOPIC_RESPONSE_SCHEMA,
		20_000
	);
}

// ── Knowledge Graph Generation via Gemini ─────────────────────────────────────

const KNOWLEDGE_GRAPH_RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		nodes: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					id: { type: 'STRING' },
					label: { type: 'STRING' },
					moduleId: { type: 'STRING' },
					importance: { type: 'INTEGER' }
				},
				required: ['id', 'label', 'moduleId', 'importance']
			}
		},
		edges: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					source: { type: 'STRING' },
					target: { type: 'STRING' },
					relationship: { type: 'STRING', enum: ['prerequisite', 'related'] },
					confidence: { type: 'NUMBER' }
				},
				required: ['source', 'target', 'relationship', 'confidence']
			}
		}
	},
	required: ['nodes', 'edges']
};

export async function generateKnowledgeGraphViaGemini(
	courseTitle: string,
	modules: Array<{ id: string; title: string; summary: string; keyPoints?: string[] }>
) {
	const systemInstruction =
		'You are an expert educational cognitive architect creating concept knowledge graphs for adaptive learning pathways. Extract 2-4 key concept nodes per module and establish clear prerequisite edges between dependent concepts. Ensure node IDs are lowercase slugs (e.g. "variables-intro", "loop-types"). Note: edge confidence values are heuristic pruning numbers, not statistical probabilities.';

	let prompt = `Course: "${courseTitle}"\nModules:\n`;
	modules.forEach((m, idx) => {
		prompt += `${idx + 1}. Module ID: "${m.id}" | Title: "${m.title}"\n   Summary: ${m.summary}\n   Key Points: ${(m.keyPoints || []).join(', ')}\n\n`;
	});

	prompt += `Output a JSON object with:
1. nodes: array of concepts (2-4 per module), with id (slug), label, moduleId (must match given Module ID), importance (1-10).
2. edges: array of prerequisite connections between concepts (source, target, relationship: "prerequisite" or "related", confidence: 0.0-1.0). Only include edges with confidence >= 0.6.`;

	return callGeminiApi<{
		nodes: Array<{ id: string; label: string; moduleId: string; importance: number }>;
		edges: Array<{
			source: string;
			target: string;
			relationship: 'prerequisite' | 'related';
			confidence: number;
		}>;
	}>(prompt, systemInstruction, KNOWLEDGE_GRAPH_RESPONSE_SCHEMA, 60_000);
}
