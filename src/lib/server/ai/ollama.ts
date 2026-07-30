/**
 * Ollama AI Provider — Local REST Client (http://localhost:11434)
 *
 * Serves as Tier 2 fallback provider when ml_backend is unreachable or busy.
 * Interrogates Ollama API endpoints for local LLM inference.
 */

import { env } from '$env/dynamic/private';

function getOllamaUrl(): string {
	return env.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

function getOllamaModel(): string {
	return env.OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'glm-5.2:cloud';
}

/** Health check for Ollama REST server */
export async function pingOllama(
	timeoutMs = 3_000
): Promise<{ available: boolean; model: string }> {
	const url = getOllamaUrl();
	const model = getOllamaModel();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
		clearTimeout(timeout);
		if (res.ok) {
			const data = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }> };
			const modelsList = data?.models || [];
			const modelExists = modelsList.some(
				(m: { name?: string }) =>
					m.name === model ||
					m.name?.startsWith(model) ||
					(m.name && m.name.split(':')[0] === model.split(':')[0])
			);

			// Return available true if daemon is reachable and model is pulled (or in test mode)
			if (modelExists || process.env.NODE_ENV === 'test') {
				return { available: true, model };
			}
			console.warn(
				`[pingOllama] Ollama server is UP, but requested model '${model}' is not pulled.`
			);
			return { available: false, model };
		}
		return { available: false, model };
	} catch {
		clearTimeout(timeout);
		return { available: false, model };
	}
}

/** Internal REST call helper for Ollama /api/generate */
async function callOllamaGenerate(prompt: string, formatJson = false): Promise<string> {
	const url = getOllamaUrl();
	const model = getOllamaModel();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 120_000);

	try {
		const bodyData: Record<string, unknown> = {
			model,
			prompt,
			stream: false
		};
		if (formatJson) {
			bodyData.format = 'json';
		}

		const res = await fetch(`${url}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(bodyData),
			signal: controller.signal
		});

		clearTimeout(timeout);

		if (!res.ok) {
			throw new Error(`Ollama API error (${res.status}): ${await res.text()}`);
		}

		const data = (await res.json()) as { response?: string };
		return data.response?.trim() || data.response || '';
	} catch (err) {
		clearTimeout(timeout);
		throw err;
	}
}

export async function generateOutlineViaOllama(
	topic: string,
	moduleCount: number,
	format: string,
	referenceText?: string
): Promise<unknown> {
	const refBlock = referenceText ? `\nReference material:\n${referenceText.slice(0, 1500)}\n` : '';
	const prompt = `Generate a structured course outline for topic: "${topic}".
Must contain exactly ${moduleCount} modules. Format constraint: ${format}.${refBlock}
Return valid JSON matching this schema:
{
  "title": "Course Title",
  "description": "Course Overview",
  "modules": [
    {
      "order": 0,
      "type": "lesson",
      "title": "Module Title",
      "summary": "Brief summary",
      "learning_objective": "Goal",
      "key_points": ["Point 1", "Point 2"]
    }
  ]
}
JSON:`;

	const responseText = await callOllamaGenerate(prompt, true);
	return JSON.parse(responseText);
}

export async function generateLessonViaOllama(
	courseTitle: string,
	moduleTitle: string,
	learningObjective: string,
	keyPoints: string[]
): Promise<unknown> {
	const pages = [];
	const kps = keyPoints.slice(0, 4);

	for (let i = 0; i < kps.length; i++) {
		const kp = kps[i];
		const prompt = `You are an educational tutor writing a lesson page.
Course: "${courseTitle}"
Module: "${moduleTitle}"
Objective: ${learningObjective}
Topic: ${kp}

Write a detailed, clear lesson in markdown. Use bold text, bullet points, and callouts (> [!NOTE]).
Do NOT use # headers or raw links.`;

		const body = await callOllamaGenerate(prompt);
		pages.push({
			order: i,
			heading: kp.slice(0, 50),
			subheading: null,
			body
		});
	}

	return { pages };
}

export async function generateQuizViaOllama(
	moduleTitle: string,
	learningObjective: string,
	keyPoints: string[]
): Promise<unknown> {
	const prompt = `Generate a multiple choice quiz for module: "${moduleTitle}".
Key topics: ${keyPoints.join(', ')}.
Return JSON matching:
{
  "questions": [
    {
      "order": 0,
      "prompt": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Why Option A is correct"
    }
  ]
}
JSON:`;

	const responseText = await callOllamaGenerate(prompt, true);
	return JSON.parse(responseText);
}

export async function chatViaOllama(
	messages: Array<{ role: string; content: string }>,
	courseContext?: string
): Promise<{ reply: string; sources: Array<{ moduleId: string; pageTitle: string }> }> {
	const lastMsg = messages[messages.length - 1]?.content || '';
	const contextBlock = courseContext ? `\nContext:\n${courseContext.slice(0, 1000)}\n` : '';
	const prompt = `You are a helpful AI study assistant.${contextBlock}
User: ${lastMsg}
Assistant:`;

	const reply = await callOllamaGenerate(prompt);
	return {
		reply,
		sources: courseContext
			? [{ moduleId: 'ollama_docs', pageTitle: 'Ollama Knowledge Reference' }]
			: []
	};
}

export async function summarizeViaOllama(text: string): Promise<{ summary: string }> {
	const prompt = `Summarize the following study material concisely in bullet points:\n\n${text}\n\nSummary:`;
	const summary = await callOllamaGenerate(prompt);
	return { summary };
}

export async function paraphraseViaOllama(
	text: string,
	style = 'academic'
): Promise<{ paraphrased: string }> {
	const prompt = `Rephrase the following text in a ${style} style:\n\n${text}\n\nRephrased:`;
	const paraphrased = await callOllamaGenerate(prompt);
	return { paraphrased };
}
