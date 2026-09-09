import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as listStudents } from './+server';
import { GET as getStudent, PATCH as updateStudent } from './[uid]/+server';
import * as rbacModule from '$lib/server/rbac';
import * as adminModule from '$lib/server/admin';
import * as authModule from '$lib/server/auth';
import { getUserLearningProfile } from '$lib/server/analytics/profileAggregator';

vi.mock('$lib/server/rbac', () => ({
	verifyAdmin: vi.fn(),
	getUserRoleAndStatus: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	invalidateUserSessionCache: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/server/analytics/profileAggregator', () => ({
	getUserLearningProfile: vi.fn()
}));

vi.mock('$lib/server/admin', () => {
	const mockCollection = vi.fn();
	return {
		adminDb: { collection: mockCollection },
		adminAuth: {
			setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
			updateUser: vi.fn().mockResolvedValue(undefined)
		},
		FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP') }
	};
});

describe('Admin Students Endpoints (/api/admin/students)', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('GET /api/admin/students lists and filters students for an admin', async () => {
		vi.mocked(rbacModule.verifyAdmin).mockResolvedValue({
			uid: 'adm_1',
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: false
		});

		const mockUsers = [
			{
				id: 'stud_1',
				data: () => ({
					email: 'alice@school.edu',
					displayName: 'Alice Cooper',
					role: 'student',
					isBanned: false,
					streak: { current: 3, longest: 5 }
				})
			},
			{
				id: 'stud_2',
				data: () => ({
					email: 'bob@school.edu',
					displayName: 'Bob Dylan',
					role: 'student',
					isBanned: true,
					bannedReason: 'Plagiarism'
				})
			}
		];

		const mockGetUsers = vi.fn().mockResolvedValue({ docs: mockUsers });
		const mockGetCourses = vi.fn().mockResolvedValue({ docs: [] });
		const mockGetQuizzes = vi.fn().mockResolvedValue({ docs: [] });

		vi.mocked(adminModule.adminDb.collection).mockImplementation((name: string) => {
			if (name === 'users')
				return { get: mockGetUsers } as unknown as ReturnType<
					typeof adminModule.adminDb.collection
				>;
			if (name === 'courses')
				return { get: mockGetCourses } as unknown as ReturnType<
					typeof adminModule.adminDb.collection
				>;
			if (name === 'quizAttempts')
				return { get: mockGetQuizzes } as unknown as ReturnType<
					typeof adminModule.adminDb.collection
				>;
			return {} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
		});

		const req = new Request('http://localhost/api/admin/students?q=alice');
		const url = new URL(req.url);
		const res = await listStudents({
			request: req,
			url
		} as unknown as Parameters<typeof listStudents>[0]);
		const json = await res.json();

		expect(res.status).toBe(200);
		expect(json.students).toHaveLength(1);
		expect(json.students[0].displayName).toBe('Alice Cooper');
		expect(json.students[0].role).toBe('student');
	});

	it('GET /api/admin/students/[uid] retrieves detailed student dossier', async () => {
		vi.mocked(rbacModule.verifyAdmin).mockResolvedValue({
			uid: 'adm_1',
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: false
		});

		vi.mocked(getUserLearningProfile).mockResolvedValue({
			userId: 'stud_1',
			totalStudyTimeMs: 120000,
			sessionCount: 5,
			conceptsMastery: {},
			weakConcepts: ['Quantum Entanglement'],
			recentActivity: [],
			lastSessionAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});

		const mockUserDoc = {
			exists: true,
			data: () => ({
				email: 'alice@school.edu',
				displayName: 'Alice Cooper',
				role: 'student',
				isBanned: false
			})
		};

		const mockCourses = {
			docs: [
				{
					id: 'c_1',
					data: () => ({ title: 'Physics 101', moduleCount: 4, progress: { completed: 2 } })
				}
			]
		};

		const mockQuizzes = {
			docs: [
				{
					id: 'q_1',
					data: () => ({ courseId: 'c_1', accuracy: 85, score: 85, totalQuestions: 10 })
				}
			]
		};

		vi.mocked(adminModule.adminDb.collection).mockImplementation((name: string) => {
			if (name === 'users') {
				return {
					doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(mockUserDoc) })
				} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
			}
			if (name === 'courses') {
				return {
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(mockCourses) })
					})
				} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
			}
			if (name === 'quizAttempts') {
				return {
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(mockQuizzes) })
					})
				} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
			}
			return {} as unknown as ReturnType<typeof adminModule.adminDb.collection>;
		});

		const req = new Request('http://localhost/api/admin/students/stud_1');
		const res = await getStudent({
			request: req,
			params: { uid: 'stud_1' }
		} as unknown as Parameters<typeof getStudent>[0]);
		const json = await res.json();

		expect(res.status).toBe(200);
		expect(json.student.displayName).toBe('Alice Cooper');
		expect(json.student.courses).toHaveLength(1);
		expect(json.student.learningProfile.weakConcepts).toContain('Quantum Entanglement');
	});

	it('PATCH /api/admin/students/[uid] allows admin to promote student to admin (merged admin model)', async () => {
		// Actor is admin
		vi.mocked(rbacModule.verifyAdmin).mockResolvedValue({
			uid: 'adm_1',
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: false
		});

		const mockUserDoc = {
			exists: true,
			data: () => ({ role: 'student', isBanned: false })
		};

		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({
				get: vi.fn().mockResolvedValue(mockUserDoc),
				update: vi.fn().mockResolvedValue(undefined)
			})
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/students/stud_1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: 'admin' })
		});

		const res = await updateStudent({
			request: req,
			params: { uid: 'stud_1' }
		} as unknown as Parameters<typeof updateStudent>[0]);
		expect(res.status).toBe(200);
	});

	it('PATCH /api/admin/students/[uid] allows superadmin to promote student to admin', async () => {
		// Actor is superadmin
		vi.mocked(rbacModule.verifyAdmin).mockResolvedValue({
			uid: 'super_1',
			role: 'superadmin',
			isAdmin: true,
			isSuperAdmin: true
		});

		const mockUserDoc = {
			exists: true,
			data: () => ({ role: 'student', isBanned: false })
		};

		const mockUpdate = vi.fn().mockResolvedValue(undefined);

		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({
				get: vi.fn().mockResolvedValue(mockUserDoc),
				update: mockUpdate
			})
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/students/stud_1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: 'admin' })
		});

		const res = await updateStudent({
			request: req,
			params: { uid: 'stud_1' }
		} as unknown as Parameters<typeof updateStudent>[0]);
		expect(res.status).toBe(200);
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				role: 'admin',
				isAdmin: true
			})
		);
		expect(adminModule.adminAuth.setCustomUserClaims).toHaveBeenCalledWith('stud_1', {
			role: 'admin',
			admin: true,
			superadmin: false
		});
	});

	it('PATCH /api/admin/students/[uid] allows admin to suspend a student', async () => {
		vi.mocked(rbacModule.verifyAdmin).mockResolvedValue({
			uid: 'adm_1',
			role: 'admin',
			isAdmin: true,
			isSuperAdmin: false
		});

		const mockUserDoc = {
			exists: true,
			data: () => ({ role: 'student', isBanned: false })
		};

		const mockUpdate = vi.fn().mockResolvedValue(undefined);

		vi.mocked(adminModule.adminDb.collection).mockReturnValue({
			doc: vi.fn().mockReturnValue({
				get: vi.fn().mockResolvedValue(mockUserDoc),
				update: mockUpdate
			})
		} as unknown as ReturnType<typeof adminModule.adminDb.collection>);

		const req = new Request('http://localhost/api/admin/students/stud_1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ isBanned: true, bannedReason: 'Repeated cheating' })
		});

		const res = await updateStudent({
			request: req,
			params: { uid: 'stud_1' }
		} as unknown as Parameters<typeof updateStudent>[0]);
		expect(res.status).toBe(200);
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				isBanned: true,
				bannedReason: 'Repeated cheating'
			})
		);
		expect(adminModule.adminAuth.updateUser).toHaveBeenCalledWith('stud_1', {
			disabled: true
		});
		expect(authModule.invalidateUserSessionCache).toHaveBeenCalledWith('stud_1');
	});
});
