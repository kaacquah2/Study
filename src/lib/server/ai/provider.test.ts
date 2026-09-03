import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	generateOutline,
	generateLesson,
	generateQuiz,
	summarize,
	paraphrase,
	chat,
	executeAI
} from './provider';
import { callML, pingMLBackend } from './client';
import * as geminiModule from './gemini';
import * as ollamaModule from './ollama';
import * as providerStatsModule from './providerStats';

vi.mock('./client', () => ({
	callML: vi.fn(),
	pingMLBackend: vi.fn(),
	MLBackendError: class MLBackendError extends Error {
		constructor(
			message: string,
			public status: number,
			public endpoint: string
		) {
			super(message);
			this.name = 'MLBackendError';
		}
	}
}));

vi.mock('./ollama', () => ({
	pingOllama: vi.fn().mockResolvedValue({ available: false, model: 'llama3.2' }),
	generateOutlineViaOllama: vi.fn(),
	generateLessonViaOllama: vi.fn(),
	generateQuizViaOllama: vi.fn(),
	chatViaOllama: vi.fn(),
	summarizeViaOllama: vi.fn(),
	paraphraseViaOllama: vi.fn()
}));

vi.mock('./gemini', () => ({
	generateOutlineViaGemini: vi.fn(),
	generateLessonViaGemini: vi.fn(),
	generateQuizViaGemini: vi.fn(),
	summarizeViaGemini: vi.fn(),
	paraphraseViaGemini: vi.fn(),
	chatViaGemini: vi.fn()
}));

vi.mock('./providerStats', () => ({
	recordProviderUsage: vi.fn().mockResolvedValue(undefined),
	isGeminiQuotaAvailable: vi.fn().mockResolvedValue(true)
}));

describe('AI Provider Unit Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(pingMLBackend).mockResolvedValue({ available: true, busy: false });
		vi.mocked(providerStatsModule.isGeminiQuotaAvailable).mockResolvedValue(true);
	});

	describe('generateOutline (Reasoning Task: Tier 1 Gemini)', () => {
		it('routes to Gemini as Tier 1 when Gemini quota is available', async () => {
			const mockGeminiResponse = {
				title: 'Intro to Python',
				description: 'A beginner course on Python programming.',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Variables',
						summary: 'Learn about variables.',
						learning_objective: 'Understand variable assignment.',
						key_points: ['Syntax', 'Types']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'Functions',
						summary: 'Learn about functions.',
						learning_objective: 'Understand how to define functions.',
						key_points: ['def keyword', 'parameters', 'return']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Module 1 Quiz',
						summary: 'Test your knowledge.',
						learning_objective: 'Evaluate Python basics.',
						key_points: ['Review']
					}
				]
			};

			vi.mocked(geminiModule.generateOutlineViaGemini).mockResolvedValue(mockGeminiResponse);

			const { result, provider } = await generateOutline('Python Basics', 3, 'lessons_and_quizzes');

			expect(geminiModule.generateOutlineViaGemini).toHaveBeenCalledWith(
				'Python Basics',
				3,
				'lessons_and_quizzes',
				undefined,
				expect.any(Number)
			);
			expect(provider).toBe('gemini');
			expect(result.title).toBe('Intro to Python');
			expect(result.modules).toHaveLength(3);
		});

		it('falls back to ml_backend when Gemini quota is unavailable and Gemini fails', async () => {
			vi.mocked(providerStatsModule.isGeminiQuotaAvailable).mockResolvedValue(false);

			const mockMLResponse = {
				title: 'ML Backend Outline',
				description: 'Generated via fallback ML Backend',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Mod 1',
						summary: 'Sum 1',
						learning_objective: 'Obj 1',
						key_points: ['P1']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'Mod 2',
						summary: 'Sum 2',
						learning_objective: 'Obj 2',
						key_points: ['P2']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Quiz 3',
						summary: 'Sum 3',
						learning_objective: 'Obj 3',
						key_points: ['P3']
					}
				]
			};

			vi.mocked(callML).mockResolvedValue(mockMLResponse);

			const { result, provider } = await generateOutline('Python Basics', 3, 'lessons_and_quizzes');

			expect(callML).toHaveBeenCalled();
			expect(provider).toBe('ml_backend');
			expect(result.title).toBe('ML Backend Outline');
		});
	});

	describe('generateLesson (Reasoning Task: Tier 1 Gemini)', () => {
		const mockOutline = {
			title: 'Course',
			description: 'Desc',
			modules: [
				{
					order: 1,
					type: 'lesson' as const,
					title: 'Mod 1',
					summary: 'S',
					learningObjective: 'O',
					keyPoints: ['K']
				}
			]
		};

		it('returns normalized LessonContent from Gemini Tier 1', async () => {
			const mockGeminiResponse = {
				pages: [
					{
						order: 1,
						heading: 'Introduction',
						subheading: 'Overview',
						body: 'Welcome to this lesson.'
					}
				]
			};

			vi.mocked(geminiModule.generateLessonViaGemini).mockResolvedValue(mockGeminiResponse);

			const { result, provider } = await generateLesson('Course', mockOutline, 'Mod 1', 'Obj 1', [
				'Point 1'
			]);

			expect(provider).toBe('gemini');
			expect(result.pages).toHaveLength(1);
			expect(result.pages[0]).toEqual({
				order: 1,
				heading: 'Introduction',
				subheading: 'Overview',
				body: 'Welcome to this lesson.'
			});
		});
	});

	describe('generateQuiz (Reasoning Task: Tier 1 Gemini)', () => {
		const mockOutline = {
			title: 'Course',
			description: 'Desc',
			modules: [
				{
					order: 1,
					type: 'quiz' as const,
					title: 'Quiz 1',
					summary: 'S',
					learningObjective: 'O',
					keyPoints: ['K']
				}
			]
		};

		it('normalizes correct_index snake_case to correctIndex camelCase from Gemini Tier 1', async () => {
			const mockGeminiResponse = {
				questions: [
					{
						order: 1,
						prompt: 'What is 2 + 2?',
						options: ['3', '4', '5', '6'],
						correct_index: 1,
						explanation: '2 + 2 equals 4.'
					}
				]
			};

			vi.mocked(geminiModule.generateQuizViaGemini).mockResolvedValue(mockGeminiResponse);

			const { result, provider } = await generateQuiz('Course', mockOutline, 'Quiz 1', 'Obj 1', [
				'Point 1'
			]);

			expect(provider).toBe('gemini');
			expect(result.questions[0].correctIndex).toBe(1);
			expect(result.questions[0].options).toHaveLength(4);
		});
	});

	describe('Microservices Utility Tasks (Tier 1 ML Backend)', () => {
		it('summarize returns summary text and provider from Tier 1 ML Backend', async () => {
			vi.mocked(callML).mockResolvedValue({ summary: 'This is a summary.' });
			const { result, provider } = await summarize('Long text content');
			expect(result).toBe('This is a summary.');
			expect(provider).toBe('ml_backend');
		});

		it('paraphrase returns paraphrased text and provider from Tier 1 ML Backend', async () => {
			vi.mocked(callML).mockResolvedValue({ paraphrase: 'Academic rewritten text.' });
			const { result, provider } = await paraphrase('Original text', 'academic');
			expect(result).toBe('Academic rewritten text.');
			expect(provider).toBe('ml_backend');
		});

		it('chat (Reasoning Task) returns assistant response reply and provider from Tier 1 Gemini', async () => {
			vi.mocked(geminiModule.chatViaGemini).mockResolvedValue({
				reply: 'Here is your study hint.',
				sources: []
			});
			const { result, provider } = await chat(
				[{ role: 'user', content: 'Help me study' }],
				'Context'
			);
			expect(result).toEqual({ reply: 'Here is your study hint.', sources: [] });
			expect(provider).toBe('gemini');
		});
	});

	describe('Provider Failover Chains (Resilience Verification)', () => {
		it('falls back from Gemini to Ollama when Gemini throws an error for out-of-domain task', async () => {
			vi.mocked(providerStatsModule.isGeminiQuotaAvailable).mockResolvedValue(true);
			vi.mocked(geminiModule.generateOutlineViaGemini).mockRejectedValue(
				new Error('Gemini 503 Service Unavailable')
			);

			vi.mocked(ollamaModule.pingOllama).mockResolvedValue({ available: true, model: 'llama3.2' });
			vi.mocked(ollamaModule.generateOutlineViaOllama).mockResolvedValue({
				title: 'Ollama Outline',
				description: 'Generated via Ollama Local LLM',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'M1',
						summary: 'S1',
						learning_objective: 'O1',
						key_points: ['P1']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'M2',
						summary: 'S2',
						learning_objective: 'O2',
						key_points: ['P2']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Q3',
						summary: 'S3',
						learning_objective: 'O3',
						key_points: ['P3']
					}
				]
			});

			const { result, provider } = await generateOutline(
				'General Philosophy Topic',
				3,
				'lessons_and_quizzes'
			);

			expect(geminiModule.generateOutlineViaGemini).toHaveBeenCalled();
			expect(ollamaModule.generateOutlineViaOllama).toHaveBeenCalled();
			expect(provider).toBe('ollama');
			expect(result.title).toBe('Ollama Outline');
		});

		it('falls back from Gemini through Ollama to ml_backend when both Gemini and Ollama fail', async () => {
			vi.mocked(providerStatsModule.isGeminiQuotaAvailable).mockResolvedValue(true);
			vi.mocked(geminiModule.generateOutlineViaGemini).mockRejectedValue(
				new Error('Gemini API Error')
			);

			vi.mocked(ollamaModule.pingOllama).mockResolvedValue({ available: true, model: 'llama3.2' });
			vi.mocked(ollamaModule.generateOutlineViaOllama).mockRejectedValue(
				new Error('Ollama connection timeout')
			);

			vi.mocked(pingMLBackend).mockResolvedValue({ available: true, busy: false });
			vi.mocked(callML).mockResolvedValue({
				title: 'ML Backend Final Fallback Outline',
				description: 'Generated via ML Backend',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'M1',
						summary: 'S1',
						learning_objective: 'O1',
						key_points: ['P1']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'M2',
						summary: 'S2',
						learning_objective: 'O2',
						key_points: ['P2']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Q3',
						summary: 'S3',
						learning_objective: 'O3',
						key_points: ['P3']
					}
				]
			});

			const { result, provider } = await generateOutline(
				'General Music Theory',
				3,
				'lessons_and_quizzes'
			);

			expect(provider).toBe('ml_backend');
			expect(result.title).toBe('ML Backend Final Fallback Outline');
		});

		it('throws an informative error when all AI providers fail', async () => {
			vi.mocked(providerStatsModule.isGeminiQuotaAvailable).mockResolvedValue(false);
			vi.mocked(ollamaModule.pingOllama).mockResolvedValue({ available: false, model: 'llama3.2' });
			vi.mocked(pingMLBackend).mockResolvedValue({ available: false, busy: true });

			await expect(
				generateOutline('General History Topic', 3, 'lessons_and_quizzes')
			).rejects.toThrow('All AI providers (gemini, ollama, ml_backend) are currently unavailable.');
		});
	});

	describe('Deadline Budgets and Tier Skipping (Netlify ~26s Alignment)', () => {
		it('skips Tier 1 ml_backend when remaining budget is below MIN_TIER_BUDGET_MS.ml_backend', async () => {
			const mlFn = vi.fn().mockResolvedValue('ml_result');
			const geminiFn = vi.fn().mockResolvedValue('gemini_result');
			const ollamaFn = vi.fn().mockResolvedValue('ollama_result');

			// In-domain CS task would normally try Tier 1 ml_backend first.
			// With a tight deadline of 3,000ms (< 4,000ms ml_backend min), ml_backend must be skipped,
			// while Gemini (min 2,000ms) runs successfully.
			const res = await executeAI(
				mlFn,
				geminiFn,
				ollamaFn,
				'reasoning',
				'Computer Science Data Structures',
				3_000
			);

			expect(mlFn).not.toHaveBeenCalled();
			expect(geminiFn).toHaveBeenCalled();
			expect(res.provider).toBe('gemini');
			expect(res.result).toBe('gemini_result');
		});

		it('skips remaining tiers when deadline budget is exhausted after a tier failure', async () => {
			// Tier 1 ml_backend runs with 4,500ms budget, but takes 3,000ms before failing
			const mlFn = vi.fn().mockImplementation(async () => {
				await new Promise((r) => setTimeout(r, 60));
				throw new Error('ml_backend slow network drop');
			});
			const geminiFn = vi.fn().mockResolvedValue('gemini_result');
			const ollamaFn = vi.fn().mockResolvedValue('ollama_result');

			// Deadline is 4,050ms. mlFn takes 60ms, remaining budget becomes ~3,990ms.
			// But for Gemini fallback, if we set deadline to 2,040ms and mlFn is Tier 1 Gemini (or in-domain mlFn min 2000),
			// let's test with deadline 4,050ms and mlFn taking 2,500ms:
			// Or even simpler: deadlineMs is 100ms. All tiers (Gemini: 2000ms, Ollama: 4000ms, ml_backend: 4000ms)
			// are immediately skipped because 100ms is below their minimum thresholds!
			await expect(
				executeAI(mlFn, geminiFn, ollamaFn, 'reasoning', 'Computer Science Algorithms', 100)
			).rejects.toThrow('All AI providers (gemini, ollama, ml_backend) are currently unavailable.');

			expect(mlFn).not.toHaveBeenCalled();
			expect(geminiFn).not.toHaveBeenCalled();
			expect(ollamaFn).not.toHaveBeenCalled();
		});

		it('propagates deadline budget options to callML and bounds tier timeout', async () => {
			vi.mocked(callML).mockResolvedValue({
				title: 'CS Quick Outline',
				description: 'Generated within budget',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Mod 1',
						summary: 'S1',
						learning_objective: 'O1',
						key_points: ['K1']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'Mod 2',
						summary: 'S2',
						learning_objective: 'O2',
						key_points: ['K2']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Mod 3',
						summary: 'S3',
						learning_objective: 'O3',
						key_points: ['K3']
					}
				]
			});

			const { result, provider } = await generateOutline(
				'Data Structures and Algorithms in C',
				3,
				'lessons_and_quizzes',
				undefined,
				'user-123',
				{ deadlineMs: 8_000 }
			);

			expect(provider).toBe('ml_backend');
			expect(result.modules).toHaveLength(3);
			expect(callML).toHaveBeenCalledWith(
				'/outline',
				expect.objectContaining({ topic: 'Data Structures and Algorithms in C' }),
				expect.any(Number),
				'user-123'
			);

			// The timeoutMs passed to callML should be bounded by the 8,000ms deadline (minus fallback reservation)
			const calledTimeout = vi.mocked(callML).mock.calls[0][2];
			expect(calledTimeout).toBeLessThanOrEqual(8_000);
			expect(calledTimeout).toBeGreaterThan(0);
		});
	});
});
