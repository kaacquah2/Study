import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb } from '$lib/server/admin';
import { verifyAdmin } from '$lib/server/rbac';
import { normalizeRole } from '$lib/rbac';

export const GET: RequestHandler = async ({ request }) => {
	try {
		await verifyAdmin(request);

		// 1. Fetch Users and compute student cohort statistics
		const usersSnap = await adminDb.collection('users').get();
		const totalUsers = usersSnap.size;

		let totalStudents = 0;
		let totalAdmins = 0;
		let totalSuperAdmins = 0;
		let bannedStudents = 0;
		let activeStudents30d = 0;
		let activeStudents7d = 0;

		const now = Date.now();
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
		const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

		for (const doc of usersSnap.docs) {
			const data = doc.data();
			const norm = normalizeRole(
				data.role || (data.isSuperAdmin ? 'superadmin' : data.isAdmin ? 'admin' : 'student')
			);

			if (norm === 'superadmin') {
				totalSuperAdmins++;
				totalAdmins++;
			} else if (norm === 'admin') {
				totalAdmins++;
			} else {
				totalStudents++;
			}

			if (data.isBanned) {
				bannedStudents++;
			}

			const createdAtMs = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
			const lastStudiedMs = data.streak?.lastStudiedOn
				? new Date(data.streak.lastStudiedOn).getTime()
				: 0;
			const lastActiveMs = Math.max(createdAtMs, lastStudiedMs);

			if (lastActiveMs > thirtyDaysAgo) {
				activeStudents30d++;
			}
			if (lastActiveMs > sevenDaysAgo) {
				activeStudents7d++;
			}
		}

		// 2. Fetch Courses and calculate completion rate
		const coursesSnap = await adminDb.collection('courses').get();
		const totalCourses = coursesSnap.size;

		let completedCourses = 0;
		const domainCounts: Record<string, number> = {
			'Computer Science & AI': 0,
			'Mathematics & Logic': 0,
			'Physical & Natural Sciences': 0,
			'Humanities & Social Sciences': 0,
			'Business & Economics': 0,
			'Languages & General': 0
		};
		const uniqueCourseOwners = new Set<string>();

		for (const doc of coursesSnap.docs) {
			const data = doc.data();
			if (data.ownerUid) uniqueCourseOwners.add(data.ownerUid);

			if (
				data.progress?.completed &&
				data.moduleCount &&
				data.progress.completed >= data.moduleCount
			) {
				completedCourses++;
			}

			const text = `${data.title || ''} ${data.topic || ''} ${data.category || ''}`.toLowerCase();
			if (/python|code|programming|neural|ai|machine learning|web|javascript|software|algorithm|deep learning/i.test(text)) {
				domainCounts['Computer Science & AI']++;
			} else if (/math|algebra|calculus|geometry|statistic|linear|probability/i.test(text)) {
				domainCounts['Mathematics & Logic']++;
			} else if (/physic|chemist|biolog|science|astronomy|neuroscience/i.test(text)) {
				domainCounts['Physical & Natural Sciences']++;
			} else if (/history|philosophy|psychology|sociology|political|art|music|literature/i.test(text)) {
				domainCounts['Humanities & Social Sciences']++;
			} else if (/business|finance|econom|market|manage|startup/i.test(text)) {
				domainCounts['Business & Economics']++;
			} else {
				domainCounts['Languages & General']++;
			}
		}

		const domainDistribution = Object.entries(domainCounts)
			.filter(([_, count]) => count > 0)
			.map(([domain, count]) => ({
				domain,
				count,
				percentage: totalCourses > 0 ? Math.round((count / totalCourses) * 100) : 0
			}))
			.sort((a, b) => b.count - a.count);

		const completionRate =
			totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

		// 3. Flags count
		const flagsSnap = await adminDb.collection('flags').get();
		const flaggedContentCount = flagsSnap.size;

		// 4. Quiz accuracy and Cohort Mastery Breakdown
		const quizAccuracies: number[] = [];
		const userAccuracyMap: Record<string, number[]> = {};

		const quizAttemptsSnap = await adminDb.collection('quizAttempts').get();
		for (const doc of quizAttemptsSnap.docs) {
			const data = doc.data();
			if (typeof data.accuracy === 'number') {
				quizAccuracies.push(data.accuracy);
				const uid = data.uid || data.userId;
				if (uid) {
					if (!userAccuracyMap[uid]) userAccuracyMap[uid] = [];
					userAccuracyMap[uid].push(data.accuracy);
				}
			}
		}

		try {
			const progressGroupSnap = await adminDb.collectionGroup('progress').get();
			for (const doc of progressGroupSnap.docs) {
				const data = doc.data();
				if (data.quizScores && typeof data.quizScores === 'object') {
					for (const val of Object.values(data.quizScores)) {
						if (typeof val === 'number') {
							quizAccuracies.push(val);
						}
					}
				}
			}
		} catch (err) {
			console.warn('[analytics] Could not query collectionGroup progress:', err);
		}

		const averageQuizAccuracy =
			quizAccuracies.length > 0
				? Math.round(quizAccuracies.reduce((a, b) => a + b, 0) / quizAccuracies.length)
				: 0;

		// Compute cohort mastery distribution across students with quiz data
		const cohortMasteryDistribution = {
			mastery: 0, // >= 85%
			proficient: 0, // 70-84%
			developing: 0, // 50-69%
			needsFocus: 0 // < 50%
		};

		for (const accList of Object.values(userAccuracyMap)) {
			if (accList.length > 0) {
				const avg = accList.reduce((a, b) => a + b, 0) / accList.length;
				if (avg >= 85) cohortMasteryDistribution.mastery++;
				else if (avg >= 70) cohortMasteryDistribution.proficient++;
				else if (avg >= 50) cohortMasteryDistribution.developing++;
				else cohortMasteryDistribution.needsFocus++;
			}
		}

		// 5. Cross-platform Weak Concept Hotspots (from userLearningProfile)
		const conceptAggregateMap: Record<
			string,
			{ tag: string; totalAttempts: number; correctCount: number }
		> = {};

		try {
			const profilesSnap = await adminDb.collection('userLearningProfile').limit(100).get();
			for (const pDoc of profilesSnap.docs) {
				const pData = pDoc.data();
				if (pData.conceptsMastery && typeof pData.conceptsMastery === 'object') {
					for (const [conceptId, item] of Object.entries(
						pData.conceptsMastery as Record<
							string,
							{ conceptTag?: string; totalAttempts?: number; correctCount?: number }
						>
					)) {
						if (!conceptAggregateMap[conceptId]) {
							conceptAggregateMap[conceptId] = {
								tag: item.conceptTag || conceptId,
								totalAttempts: 0,
								correctCount: 0
							};
						}
						conceptAggregateMap[conceptId].totalAttempts += item.totalAttempts || 0;
						conceptAggregateMap[conceptId].correctCount += item.correctCount || 0;
					}
				}
			}
		} catch (err) {
			console.warn('[analytics] Error aggregating concept mastery:', err);
		}

		const weakConceptHotspots = Object.entries(conceptAggregateMap)
			.filter(([, stats]) => stats.totalAttempts >= 3)
			.map(([conceptId, stats]) => {
				const errorRate = Math.round(
					((stats.totalAttempts - stats.correctCount) / stats.totalAttempts) * 100
				);
				const accuracy = 100 - errorRate;
				return {
					conceptId,
					tag: stats.tag,
					totalAttempts: stats.totalAttempts,
					errorRate,
					accuracy
				};
			})
			.sort((a, b) => b.errorRate - a.errorRate)
			.slice(0, 8);

		// 6. Cohort Activity Sparkline Data (last 14 days)
		const dailyActivityMap: Record<string, { attempts: number; totalAccuracy: number }> = {};
		for (let i = 13; i >= 0; i--) {
			const d = new Date(now - i * 24 * 60 * 60 * 1000);
			const dateKey = d.toISOString().slice(0, 10);
			dailyActivityMap[dateKey] = { attempts: 0, totalAccuracy: 0 };
		}

		for (const doc of quizAttemptsSnap.docs) {
			const data = doc.data();
			const timestamp = data.timestamp || data.createdAt;
			if (timestamp) {
				const dateStr =
					typeof timestamp === 'string'
						? timestamp.slice(0, 10)
						: timestamp.toDate
							? timestamp.toDate().toISOString().slice(0, 10)
							: '';
				if (dailyActivityMap[dateStr]) {
					dailyActivityMap[dateStr].attempts++;
					if (typeof data.accuracy === 'number') {
						dailyActivityMap[dateStr].totalAccuracy += data.accuracy;
					}
				}
			}
		}

		const dailyActivity = Object.entries(dailyActivityMap).map(([date, val]) => ({
			date,
			attempts: val.attempts,
			averageAccuracy: val.attempts > 0 ? Math.round(val.totalAccuracy / val.attempts) : 0
		}));

		// 7. AI Provider Fallback & ML Backend Health
		const { getProviderStats } = await import('$lib/server/ai/providerStats');
		let fallbackStats = await getProviderStats();

		if (fallbackStats.geminiCount === 0 && fallbackStats.mlBackendCount === 0) {
			let geminiCount = 0;
			let mlBackendCount = 0;
			let ollamaCount = 0;

			for (const doc of coursesSnap.docs) {
				const modulesSnap = await doc.ref.collection('modules').get();
				for (const modDoc of modulesSnap.docs) {
					const mod = modDoc.data();
					if (
						mod.model === 'gemini' ||
						mod.model === 'gemini-1.5-flash' ||
						mod.model === 'gemini-2.5-flash' ||
						mod.usedFallback === true
					) {
						geminiCount++;
					} else if (mod.model === 'ollama' || mod.model?.includes('ollama')) {
						ollamaCount++;
					} else if (
						mod.model === 'ml_backend' ||
						mod.model === 'flan-t5-large' ||
						mod.status === 'ready'
					) {
						mlBackendCount++;
					}
				}
			}

			const totalProcessed = geminiCount + mlBackendCount + ollamaCount;
			fallbackStats = {
				geminiCount,
				mlBackendCount,
				ollamaCount,
				fallbackPercentage:
					totalProcessed > 0
						? Number((((geminiCount + ollamaCount) / totalProcessed) * 100).toFixed(1))
						: 0
			};
		}

		const { getMLBackendHealth } = await import('$lib/server/ai/client');
		let mlHealthData = null;
		try {
			mlHealthData = await getMLBackendHealth(4000);
		} catch (e) {
			console.warn('[analytics] Live ML backend health check skipped:', e);
		}

		const activeQuizUsersCount = Object.keys(userAccuracyMap).length;
		const learningFunnel = [
			{
				stage: 'Registered Accounts',
				count: totalUsers,
				description: 'Total student and admin accounts'
			},
			{
				stage: 'Course Creators',
				count: uniqueCourseOwners.size || (totalCourses > 0 ? 1 : 0),
				description: 'Created or enrolled in a course'
			},
			{
				stage: 'Active in Quizzes',
				count: activeQuizUsersCount || (totalCourses > 0 ? 1 : 0),
				description: 'Engaged in knowledge checks'
			},
			{
				stage: 'Completed Modules',
				count: completedCourses || (totalCourses > 0 ? 1 : 0),
				description: 'Finished at least 1 study module'
			},
			{
				stage: 'High Mastery (≥85%)',
				count: cohortMasteryDistribution.mastery || (cohortMasteryDistribution.proficient ? 1 : 0),
				description: 'Retention score across topics'
			}
		];

		return json({
			analytics: {
				coursesGenerated: totalCourses,
				completionRate,
				averageQuizAccuracy,
				flaggedContentCount,
				fallbackFrequency: fallbackStats,
				mlBackendHealth: mlHealthData,
				studentStats: {
					totalUsers,
					totalStudents,
					totalAdmins,
					totalSuperAdmins,
					bannedStudents,
					activeStudents30d,
					activeStudents7d,
					cohortMasteryDistribution
				},
				weakConceptHotspots,
				dailyActivity,
				domainDistribution,
				learningFunnel
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('FORBIDDEN') || message.includes('privileges required')) {
			return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		console.error('Admin Analytics API error:', err);
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
