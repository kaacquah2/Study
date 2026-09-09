import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb } from '$lib/server/admin';
import { verifyAdmin } from '$lib/server/rbac';
import { normalizeRole } from '$lib/rbac';

export interface AdminStudentSummary {
	uid: string;
	email: string;
	displayName: string | null;
	photoURL: string | null;
	role: 'student' | 'instructor' | 'admin' | 'superadmin';
	isBanned: boolean;
	bannedReason: string | null;
	createdAt: string;
	streakCurrent: number;
	streakLongest: number;
	courseCount: number;
	averageAccuracy: number;
	quizzesTaken: number;
	lastActive: string;
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		await verifyAdmin(request);

		const q = url.searchParams.get('q')?.toLowerCase().trim() || '';
		const roleFilter = url.searchParams.get('role')?.toLowerCase() || 'all';
		const statusFilter = url.searchParams.get('status')?.toLowerCase() || 'all';
		const sortField = url.searchParams.get('sort') || 'recent';

		// 1. Fetch all users
		const usersSnap = await adminDb.collection('users').get();

		// 2. Fetch course counts by ownerUid in one batch
		const coursesSnap = await adminDb.collection('courses').get();
		const courseCountMap: Record<string, number> = {};
		for (const doc of coursesSnap.docs) {
			const owner = doc.data().ownerUid;
			if (owner) {
				courseCountMap[owner] = (courseCountMap[owner] || 0) + 1;
			}
		}

		// 3. Fetch quiz performance aggregates by user
		const quizAttemptsSnap = await adminDb.collection('quizAttempts').get();
		const quizStatsMap: Record<string, { totalAcc: number; count: number }> = {};
		for (const doc of quizAttemptsSnap.docs) {
			const data = doc.data();
			const uid = data.uid || data.userId;
			if (uid && typeof data.accuracy === 'number') {
				if (!quizStatsMap[uid]) {
					quizStatsMap[uid] = { totalAcc: 0, count: 0 };
				}
				quizStatsMap[uid].totalAcc += data.accuracy;
				quizStatsMap[uid].count++;
			}
		}

		const students: AdminStudentSummary[] = [];

		for (const doc of usersSnap.docs) {
			const data = doc.data();
			const uid = doc.id;
			const email = data.email || '';
			const displayName = data.displayName || null;
			const photoURL = data.photoURL || null;

			const rawRole =
				data.role || (data.isSuperAdmin ? 'superadmin' : data.isAdmin ? 'admin' : 'student');
			const role = normalizeRole(rawRole);
			const isBanned = data.isBanned === true;
			const bannedReason = data.bannedReason || null;

			// Search query filter
			if (q) {
				const matchEmail = email.toLowerCase().includes(q);
				const matchName = (displayName || '').toLowerCase().includes(q);
				const matchUid = uid.toLowerCase().includes(q);
				if (!matchEmail && !matchName && !matchUid) {
					continue;
				}
			}

			// Role filter
			if (roleFilter !== 'all') {
				if (roleFilter === 'student' && role !== 'student') continue;
				if (roleFilter === 'admin' && role !== 'admin') continue;
				if (roleFilter === 'superadmin' && role !== 'superadmin') continue;
				if (roleFilter === 'instructor' && role !== 'instructor') continue;
			}

			// Status filter
			if (statusFilter === 'active' && isBanned) continue;
			if (statusFilter === 'suspended' && !isBanned) continue;

			const createdAt = data.createdAt?.toDate
				? data.createdAt.toDate().toISOString()
				: new Date().toISOString();

			const lastActive = data.streak?.lastStudiedOn || createdAt;
			const streakCurrent = data.streak?.current || 0;
			const streakLongest = data.streak?.longest || 0;
			const courseCount = courseCountMap[uid] || 0;

			const quizStats = quizStatsMap[uid];
			const quizzesTaken = quizStats?.count || 0;
			const averageAccuracy = quizzesTaken > 0 ? Math.round(quizStats.totalAcc / quizzesTaken) : 0;

			students.push({
				uid,
				email,
				displayName,
				photoURL,
				role,
				isBanned,
				bannedReason,
				createdAt,
				streakCurrent,
				streakLongest,
				courseCount,
				averageAccuracy,
				quizzesTaken,
				lastActive
			});
		}

		// Sort results
		students.sort((a, b) => {
			if (sortField === 'accuracy') {
				return b.averageAccuracy - a.averageAccuracy;
			}
			if (sortField === 'streak') {
				return b.streakCurrent - a.streakCurrent;
			}
			if (sortField === 'courses') {
				return b.courseCount - a.courseCount;
			}
			// Default: recent
			return (b.createdAt || '').localeCompare(a.createdAt || '');
		});

		return json({
			students,
			total: students.length
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('FORBIDDEN') || message.includes('privileges required')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		console.error('Admin Students API error:', err);
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
