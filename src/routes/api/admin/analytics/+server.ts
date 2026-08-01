import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		// Check if user is admin
		const userDoc = await adminDb.collection('users').doc(user.uid).get();
		const userData = userDoc.data();

		if (!userData?.isAdmin) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'Admin privileges required' } },
				{ status: 403 }
			);
		}

		// Fetch courses
		const coursesSnap = await adminDb.collection('courses').get();
		const totalCourses = coursesSnap.size;

		let completedCourses = 0;
		for (const doc of coursesSnap.docs) {
			const data = doc.data();
			if (
				data.progress?.completed &&
				data.moduleCount &&
				data.progress.completed >= data.moduleCount
			) {
				completedCourses++;
			}
		}

		const completionRate =
			totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

		// Fetch flags count
		const flagsSnap = await adminDb.collection('flags').get();
		const flaggedContentCount = flagsSnap.size;

		// Fetch quiz attempts and user progress documents to compute real average quiz accuracy
		const quizAccuracies: number[] = [];

		const quizAttemptsSnap = await adminDb.collection('quizAttempts').get();
		for (const doc of quizAttemptsSnap.docs) {
			const data = doc.data();
			if (typeof data.accuracy === 'number') {
				quizAccuracies.push(data.accuracy);
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

		// Calculate AI provider fallback stats from providerStats document (and fallback to module scanning if needed)
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

			const totalProcessedModules = geminiCount + mlBackendCount + ollamaCount;
			const fallbackPercentage =
				totalProcessedModules > 0
					? Number((((geminiCount + ollamaCount) / totalProcessedModules) * 100).toFixed(1))
					: 0;

			fallbackStats = {
				geminiCount,
				mlBackendCount,
				ollamaCount,
				fallbackPercentage
			};
		}

		// Query live ML Backend Health if available
		const { callML } = await import('$lib/server/ai/client');
		let mlHealthData = null;
		try {
			mlHealthData = await callML<{
				status: string;
				models_loaded: Record<string, boolean>;
				inference_busy: boolean;
			}>('/healthcheck', undefined, 5000);
		} catch (e) {
			console.warn('[analytics] Live ML backend query skipped:', e);
		}

		return json({
			analytics: {
				coursesGenerated: totalCourses,
				completionRate,
				averageQuizAccuracy,
				flaggedContentCount,
				fallbackFrequency: fallbackStats,
				mlBackendHealth: mlHealthData
			}
		});

	} catch (err) {
		console.error('Admin Analytics API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
