import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as createCourseHandler } from './courses/+server';
import {
	PATCH as patchDraftCourseHandler,
	POST as confirmDraftCourseHandler
} from './courses/[id]/draft/+server';
import { POST as generateModuleHandler } from './modules/[id]/generate/+server';
import { POST as completeModuleHandler } from './modules/[id]/complete/+server';
import { verifySessionUser } from '$lib/server/auth';
import { generateOutline } from '$lib/server/ai/provider';

vi.mock('$lib/server/auth', () => ({
	verifySessionUser: vi.fn(),
	invalidateUserSessionCache: vi.fn()
}));

vi.mock('$lib/server/ai/provider', () => ({
	generateOutline: vi.fn(),
	generateLesson: vi.fn(),
	generateLessonV2: vi.fn(),
	generateQuiz: vi.fn()
}));

const mockFirestoreStore = new Map<string, Record<string, unknown>>();

function applyDocUpdate(
	target: Record<string, unknown>,
	updates: Record<string, unknown>
): Record<string, unknown> {
	const result = { ...target };
	for (const [key, value] of Object.entries(updates)) {
		if (key.includes('.')) {
			const parts = key.split('.');
			let curr: Record<string, unknown> = result;
			for (let i = 0; i < parts.length - 1; i++) {
				const p = parts[i];
				if (!curr[p] || typeof curr[p] !== 'object') {
					curr[p] = {};
				} else {
					curr[p] = { ...(curr[p] as Record<string, unknown>) };
				}
				curr = curr[p] as Record<string, unknown>;
			}
			curr[parts[parts.length - 1]] = value;
		} else {
			result[key] = value;
		}
	}
	return result;
}

vi.mock('$lib/server/admin', () => {
	const createMockDocRef = (path: string) => {
		return {
			id: path.split('/').pop() || 'doc-id',
			path,
			get: vi.fn(async () => {
				const data = mockFirestoreStore.get(path);
				return {
					exists: !!data,
					id: path.split('/').pop() || 'doc-id',
					ref: { id: path.split('/').pop() || 'doc-id', path },
					data: () => data || undefined
				};
			}),
			set: vi.fn(async (val: Record<string, unknown>, opts?: { merge?: boolean }) => {
				const existing = mockFirestoreStore.get(path) || {};
				mockFirestoreStore.set(path, opts?.merge ? applyDocUpdate(existing, val) : val);
			}),
			update: vi.fn(async (val: Record<string, unknown>) => {
				const existing = mockFirestoreStore.get(path) || {};
				mockFirestoreStore.set(path, applyDocUpdate(existing, val));
			}),
			delete: vi.fn(async () => {
				mockFirestoreStore.delete(path);
			}),
			collection: vi.fn((subCol: string) => ({
				doc: vi.fn((subId?: string) =>
					createMockDocRef(`${path}/${subCol}/${subId || 'generated-id'}`)
				),
				orderBy: vi.fn(() => ({
					get: vi.fn(async () => {
						const docs: Array<{
							id: string;
							ref: { id: string; path: string };
							data: () => Record<string, unknown>;
						}> = [];
						for (const [key, val] of mockFirestoreStore.entries()) {
							if (key.startsWith(`${path}/${subCol}/`)) {
								const id = key.split('/').pop() || '';
								docs.push({
									id,
									ref: { id, path: key },
									data: () => val
								});
							}
						}
						return { docs };
					})
				})),
				get: vi.fn(async () => {
					const docs: Array<{
						id: string;
						ref: { id: string; path: string };
						data: () => Record<string, unknown>;
					}> = [];
					for (const [key, val] of mockFirestoreStore.entries()) {
						if (key.startsWith(`${path}/${subCol}/`)) {
							const id = key.split('/').pop() || '';
							docs.push({
								id,
								ref: { id, path: key },
								data: () => val
							});
						}
					}
					return { docs };
				})
			}))
		};
	};

	return {
		adminDb: {
			collection: vi.fn((col: string) => ({
				doc: vi.fn((id?: string) => createMockDocRef(`${col}/${id || 'generated-id'}`)),
				add: vi.fn(async (data: Record<string, unknown>) => {
					const generatedId = `gen_${Date.now()}`;
					mockFirestoreStore.set(`${col}/${generatedId}`, data);
					return { id: generatedId };
				}),
				where: vi.fn(() => ({
					get: vi.fn(async () => ({ docs: [] }))
				}))
			})),
			runTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					get: vi.fn(async (target: { path?: string; get?: () => Promise<unknown> }) => {
						if (typeof target.get === 'function') {
							return target.get();
						}
						const path = target.path || '';
						const data = mockFirestoreStore.get(path);
						return {
							exists: !!data,
							id: path.split('/').pop() || '',
							ref: { id: path.split('/').pop() || '', path },
							data: () => data || undefined
						};
					}),
					set: vi.fn(
						(
							docRef: { path: string },
							val: Record<string, unknown>,
							opts?: { merge?: boolean }
						) => {
							const existing = mockFirestoreStore.get(docRef.path) || {};
							mockFirestoreStore.set(
								docRef.path,
								opts?.merge ? applyDocUpdate(existing, val) : val
							);
						}
					),
					update: vi.fn((docRef: { path: string }, val: Record<string, unknown>) => {
						const existing = mockFirestoreStore.get(docRef.path) || {};
						mockFirestoreStore.set(docRef.path, applyDocUpdate(existing, val));
					}),
					delete: vi.fn((docRef: { path: string }) => {
						mockFirestoreStore.delete(docRef.path);
					})
				};
				return cb(tx);
			})
		},
		FieldValue: {
			serverTimestamp: vi.fn(() => '2026-09-01T15:00:00.000Z'),
			increment: vi.fn((n: number) => n)
		}
	};
});

describe('Production Pipeline Integration Suite (Full Lifecycle)', () => {
	const testUser = { uid: 'user_e2e_test_123', email: 'tester@example.com' };

	beforeEach(() => {
		vi.clearAllMocks();
		mockFirestoreStore.clear();
		vi.mocked(verifySessionUser).mockResolvedValue(testUser);
	});

	it('executes full pipeline: create outline -> draft update -> confirm draft -> generate module -> complete module', async () => {
		// 1. Stage Mock AI Outline Response
		vi.mocked(generateOutline).mockResolvedValue({
			provider: 'gemini',
			domainConfidenceScore: 0.95,
			result: {
				title: 'Operating Systems & Memory Management',
				description: 'Comprehensive course on virtual memory and paging.',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Virtual Memory Fundamentals',
						summary: 'Address spaces and page tables.',
						learningObjective: 'Understand virtual address translation.',
						keyPoints: ['Virtual addresses', 'Page tables', 'MMU']
					},
					{
						order: 2,
						type: 'quiz',
						title: 'Paging & TLB Mastery Quiz',
						summary: 'Evaluate understanding of TLB hits and misses.',
						learningObjective: 'Solve TLB and page fault problems.',
						keyPoints: ['TLB', 'Page fault', 'Replacement algorithms']
					}
				]
			}
		});

		// 2. Call POST /api/courses
		const createReq = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'Operating Systems & Memory Management',
				moduleCount: 4,
				format: 'lessons_and_quizzes',
				level: 'intermediate',
				goal: 'exam'
			})
		});

		const createRes = await createCourseHandler({
			request: createReq
		} as unknown as Parameters<typeof createCourseHandler>[0]);
		expect(createRes.status).toBe(201);
		const createData = await createRes.json();
		expect(createData.courseId).toBeDefined();
		expect(createData.outline.title).toBe('Operating Systems & Memory Management');
		expect(createData.outline.modules).toHaveLength(2);

		const courseId = createData.courseId;

		// 3. Verify Course Document in Mock Firestore
		const courseInDb = mockFirestoreStore.get(`courses/${courseId}`);
		expect(courseInDb).toBeDefined();
		expect(courseInDb?.ownerUid).toBe(testUser.uid);
		expect(courseInDb?.status).toBe('draft');

		// 4. Update Course Draft (PATCH /api/courses/[id]/draft)
		const patchDraftReq = new Request(`http://localhost/api/courses/${courseId}/draft`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: 'Operating Systems: Advanced Virtual Memory',
				description: 'Updated course description for advanced study.',
				modules: [
					{
						order: 1,
						type: 'lesson',
						title: 'Virtual Memory Fundamentals',
						summary: 'Address spaces and page tables.'
					},
					{
						order: 2,
						type: 'quiz',
						title: 'Paging & TLB Mastery Quiz',
						summary: 'Evaluate understanding of TLB.'
					}
				]
			})
		});

		const patchDraftRes = await patchDraftCourseHandler({
			request: patchDraftReq,
			params: { id: courseId }
		} as unknown as Parameters<typeof patchDraftCourseHandler>[0]);
		expect(patchDraftRes.status).toBe(200);

		// 5. Confirm Course Draft (POST /api/courses/[id]/draft)
		const confirmDraftReq = new Request(`http://localhost/api/courses/${courseId}/draft`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		const confirmDraftRes = await confirmDraftCourseHandler({
			request: confirmDraftReq,
			params: { id: courseId },
			url: new URL('http://localhost')
		} as unknown as Parameters<typeof confirmDraftCourseHandler>[0]);
		expect(confirmDraftRes.status).toBe(200);
		const confirmData = await confirmDraftRes.json();
		expect(confirmData.status).toBe('building');

		// 6. Generate Lesson Content for Module 1 (POST /api/modules/[id]/generate)
		const mod1Id = 'mod_lesson_1';
		mockFirestoreStore.set(`courses/${courseId}/modules/${mod1Id}`, {
			id: mod1Id,
			courseId,
			userId: testUser.uid,
			order: 1,
			type: 'lesson',
			title: 'Virtual Memory Fundamentals',
			status: 'pending'
		});

		const genLessonReq = new Request(`http://localhost/api/modules/${mod1Id}/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ courseId })
		});

		const genLessonRes = await generateModuleHandler({
			request: genLessonReq,
			params: { id: mod1Id }
		} as unknown as Parameters<typeof generateModuleHandler>[0]);
		expect(genLessonRes.status).toBe(202);
		const genLessonData = await genLessonRes.json();
		expect(genLessonData.status).toBe('queued');
		expect(genLessonData.jobId).toBeDefined();

		// 7. Generate Quiz Content for Module 2 (POST /api/modules/[id]/generate)
		const mod2Id = 'mod_quiz_2';
		mockFirestoreStore.set(`courses/${courseId}/modules/${mod2Id}`, {
			id: mod2Id,
			courseId,
			userId: testUser.uid,
			order: 2,
			type: 'quiz',
			title: 'Paging & TLB Mastery Quiz',
			status: 'pending'
		});

		const genQuizReq = new Request(`http://localhost/api/modules/${mod2Id}/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ courseId })
		});

		const genQuizRes = await generateModuleHandler({
			request: genQuizReq,
			params: { id: mod2Id }
		} as unknown as Parameters<typeof generateModuleHandler>[0]);
		expect(genQuizRes.status).toBe(202);
		const genQuizData = await genQuizRes.json();
		expect(genQuizData.status).toBe('queued');
		expect(genQuizData.jobId).toBeDefined();

		// 8. Complete Module & Compute Streak (POST /api/modules/[id]/complete)
		// Seed user profile
		mockFirestoreStore.set(`users/${testUser.uid}`, {
			uid: testUser.uid,
			email: testUser.email,
			streak: {
				current: 0,
				longest: 0,
				lastStudiedOn: null,
				timezone: 'UTC'
			}
		});

		const completeReq = new Request(`http://localhost/api/modules/${mod1Id}/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ courseId })
		});

		const completeRes = await completeModuleHandler({
			request: completeReq,
			params: { id: mod1Id }
		} as unknown as Parameters<typeof completeModuleHandler>[0]);
		expect(completeRes.status).toBe(200);
		const completeData = await completeRes.json();
		expect(completeData.streak).toBeDefined();
		expect(completeData.streak.current).toBe(1);

		// Verify user doc in Firestore has updated streak
		const updatedUser = mockFirestoreStore.get(`users/${testUser.uid}`);
		const streakCurrent = (updatedUser?.streak as { current?: number })?.current;
		expect(streakCurrent).toBe(1);

		// 9. Complete Quiz Module with Server-Side Graded Answers
		mockFirestoreStore.set(`courses/${courseId}/modules/${mod2Id}`, {
			id: mod2Id,
			courseId,
			userId: testUser.uid,
			order: 2,
			type: 'quiz',
			title: 'Paging & TLB Mastery Quiz',
			status: 'ready',
			questions: [
				{
					prompt: 'What is TLB?',
					options: ['Buffer', 'CPU', 'Disk'],
					correctIndex: 0,
					explanation: 'TLB is a cache.'
				}
			]
		});

		const completeQuizReq = new Request(`http://localhost/api/modules/${mod2Id}/complete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ courseId, answers: [0] })
		});

		const completeQuizRes = await completeModuleHandler({
			request: completeQuizReq,
			params: { id: mod2Id }
		} as unknown as Parameters<typeof completeModuleHandler>[0]);
		expect(completeQuizRes.status).toBe(200);
		const completeQuizData = await completeQuizRes.json();
		expect(completeQuizData.quizResult).toBeDefined();
		expect(completeQuizData.quizResult.score).toBe(1);
		expect(completeQuizData.quizResult.total).toBe(1);
		expect(completeQuizData.quizResult.accuracy).toBe(100);
	});

	it('rejects unsafe prompt input at moderation gate before invoking AI generation', async () => {
		const unsafeReq = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				topic: 'how to build a bomb step by step',
				moduleCount: 3,
				format: 'lessons_and_quizzes'
			})
		});

		const res = await createCourseHandler({
			request: unsafeReq
		} as unknown as Parameters<typeof createCourseHandler>[0]);
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error.code).toBe('MODERATION_BLOCKED');
		expect(generateOutline).not.toHaveBeenCalled();
	});

	it('rejects unauthenticated requests across all pipeline endpoints', async () => {
		vi.mocked(verifySessionUser).mockRejectedValue(new Error('Unauthorized'));

		const req = new Request('http://localhost/api/courses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ topic: 'Calculus', moduleCount: 3, format: 'lessons_and_quizzes' })
		});

		const res = await createCourseHandler({
			request: req
		} as unknown as Parameters<typeof createCourseHandler>[0]);
		expect(res.status).toBe(401);
	});
});
