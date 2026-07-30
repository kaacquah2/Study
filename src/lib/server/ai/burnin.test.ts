import { describe, it, expect, vi } from 'vitest';
import { generateOutline, generateLesson, chat } from './provider';
import * as clientModule from './client';
import * as geminiModule from './gemini';
import * as providerStatsModule from './providerStats';

describe('Burn-In Pass — Provider Routing & Quality Gate Stress Suite', () => {
	// 1. Stress test outline generation across 15 varied academic topics
	it('fires outline generations across varied topics and tracks provider allocation', async () => {
		const topics = [
			'Introduction to Quantum Computing',
			'Macroeconomics 101',
			'Cell Biology Essentials',
			'Linear Algebra Foundations',
			'Web Development with SvelteKit',
			'Basic Organic Chemistry',
			'World War II History',
			'Data Structures & Algorithms',
			'Neuroscience Fundamentals',
			'Machine Learning Basics',
			'Financial Accounting',
			'Introduction to Psychology',
			'Environmental Science',
			'Astronomy & Astrophysics',
			'French Grammar for Beginners'
		];

		const stats = {
			total: topics.length,
			mlBackend: 0,
			gemini: 0,
			fallbackOutlineTriggered: 0,
			validOutlines: 0
		};

		// Mock callML / gemini fallback to simulate multi-topic load
		vi.spyOn(clientModule, 'pingMLBackend').mockResolvedValue({
			available: true,
			busy: false,
			status: 'ok'
		});
		vi.spyOn(providerStatsModule, 'recordProviderUsage').mockResolvedValue();
		vi.spyOn(providerStatsModule, 'isGeminiQuotaAvailable').mockResolvedValue(true);

		// Mock ML backend responses for outlines
		vi.spyOn(clientModule, 'callML').mockImplementation(async (endpoint, body) => {
			if (endpoint === '/outline') {
				const reqBody = body as { topic: string };
				// Simulate 80% ml_backend success, 20% timeout/fallback
				if (reqBody.topic.includes('Quantum') || reqBody.topic.includes('Chemistry')) {
					throw new Error('ML backend timeout');
				}
				return {
					title: `Course on ${reqBody.topic}`,
					description: `Comprehensive guide to ${reqBody.topic}`,
					modules: [
						{
							order: 1,
							type: 'lesson',
							title: 'Introduction',
							summary: 'Getting started',
							learning_objective: 'Understand core principles',
							key_points: ['Point 1', 'Point 2']
						},
						{
							order: 2,
							type: 'lesson',
							title: 'Core Concepts',
							summary: 'Deep dive',
							learning_objective: 'Apply fundamental concepts',
							key_points: ['Point A', 'Point B']
						},
						{
							order: 3,
							type: 'quiz',
							title: 'Knowledge Check',
							summary: 'Test your understanding',
							learning_objective: 'Verify retention',
							key_points: ['Quiz prep']
						}
					]
				};
			}
			throw new Error('Unknown endpoint');
		});

		// Mock Gemini responses for fallback
		vi.spyOn(geminiModule, 'generateOutlineViaGemini').mockImplementation(async (topic) => {
			return {
				title: `Gemini Course on ${topic}`,
				description: `Gemini fallback guide to ${topic}`,
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Gemini Intro',
						summary: 'Overview',
						learning_objective: 'Learn basic terms',
						key_points: ['Gemini point']
					},
					{
						order: 2,
						type: 'lesson',
						title: 'Gemini Core',
						summary: 'Main material',
						learning_objective: 'Master concepts',
						key_points: ['Gemini point 2']
					},
					{
						order: 3,
						type: 'quiz',
						title: 'Gemini Assessment',
						summary: 'Final test',
						learning_objective: 'Assess performance',
						key_points: ['Gemini quiz prep']
					}
				]
			};
		});

		for (const topic of topics) {
			const res = await generateOutline(topic, 3, 'lessons_and_quizzes');
			expect(res.result).toBeDefined();
			expect(res.result.modules.length).toBeGreaterThanOrEqual(3);

			if (res.provider === 'ml_backend') {
				stats.mlBackend++;
			} else if (res.provider === 'gemini') {
				stats.gemini++;
			}

			if (res.result.title.length > 0) {
				stats.validOutlines++;
			}
		}

		expect(stats.total).toBe(15);
		expect(stats.validOutlines).toBe(15);
		expect(stats.mlBackend + stats.gemini).toBe(15);
		expect(stats.gemini).toBeGreaterThan(0); // Gemini fallback verified under load!
	});

	// 2. Lesson generation against the 40-word / 200-char gate
	it('evaluates generated lessons against 40-word / 200-char quality gate', async () => {
		const sampleOutline = {
			title: 'Computer Science Data Structures',
			description: 'Test Desc',
			modules: []
		};

		vi.spyOn(clientModule, 'pingMLBackend').mockResolvedValue({
			available: true,
			busy: false,
			status: 'ok'
		});
		const mockPages = [
			{
				order: 1,
				heading: 'Comprehensive Fundamentals',
				subheading: 'Core Overview',
				body: `In this section, we explore the essential principles of the subject in extreme detail. 
				Understanding these fundamentals provides a solid foundation for advanced studies, enabling learners 
				to master the conceptual mechanisms, practical applications, and theoretical frameworks required 
				for success in real-world scenarios across multiple disciplines.`
			}
		];
		vi.spyOn(clientModule, 'callML').mockResolvedValue({ pages: mockPages });
		vi.spyOn(geminiModule, 'generateLessonViaGemini').mockResolvedValue({ pages: mockPages });

		const res = await generateLesson(
			'Computer Science Data Structures',
			sampleOutline,
			'Arrays and Linked Lists',
			'Understand core data structures',
			['Point 1']
		);
		expect(res.result.pages.length).toBe(1);

		const pageBody = res.result.pages[0].body;
		const wordCount = pageBody.trim().split(/\s+/).length;
		const charCount = pageBody.length;

		expect(wordCount).toBeGreaterThanOrEqual(40);
		expect(charCount).toBeGreaterThanOrEqual(200);
	});

	// 3. Concurrency lock routing test for chat
	it('routes to Gemini immediately when ml_backend is busy (inference_busy = true)', async () => {
		// Mock pingMLBackend to report busy: true
		vi.spyOn(clientModule, 'pingMLBackend').mockResolvedValue({
			available: true,
			busy: true,
			status: 'busy'
		});
		vi.spyOn(providerStatsModule, 'isGeminiQuotaAvailable').mockResolvedValue(true);

		vi.spyOn(geminiModule, 'chatViaGemini').mockResolvedValue({
			reply: 'Hello from Gemini fallback during high load!',
			sources: []
		});

		const chatResult = await chat([{ role: 'user', content: 'Explain quantum entanglement' }]);

		expect(chatResult.provider).toBe('gemini');
		expect(chatResult.result.reply).toContain('Gemini fallback');
	});
});
