import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { z } from 'zod';

const CompleteModuleZod = z.object({
	courseId: z.string(),
	timezone: z.string().optional(),
	quizScore: z.number().int().min(0).optional(),
	quizTotal: z.number().int().min(1).optional()
});

// POST /api/modules/[id]/complete
export async function POST({ params, request }) {
	const { id: moduleId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = CompleteModuleZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Missing courseId' } },
				{ status: 400 }
			);
		}

		const { courseId, timezone } = parsed.data;

		const userRef = adminDb.collection('users').doc(user.uid);
		const progressRef = userRef.collection('progress').doc(courseId);
		const courseRef = adminDb.collection('courses').doc(courseId);

		const isValidTimezone = (t: string): boolean => {
			try {
				Intl.DateTimeFormat(undefined, { timeZone: t });
				return true;
			} catch {
				return false;
			}
		};

		const result = await adminDb.runTransaction(async (transaction) => {
			// Verify parent course exists and is owned by the user
			const courseDoc = await transaction.get(courseRef);
			if (!courseDoc.exists) {
				throw new Error('COURSE_NOT_FOUND');
			}
			const courseData = courseDoc.data();
			if (courseData?.ownerUid !== user.uid) {
				throw new Error('FORBIDDEN');
			}

			// Verify that the module actually belongs to this course
			const moduleRef = courseRef.collection('modules').doc(moduleId);
			const moduleDoc = await transaction.get(moduleRef);
			if (!moduleDoc.exists) {
				throw new Error('MODULE_NOT_FOUND');
			}

			const userDoc = await transaction.get(userRef);
			if (!userDoc.exists) {
				throw new Error('USER_NOT_FOUND');
			}

			// Fetch current progress list before any writes
			const progressDoc = await transaction.get(progressRef);

			const userData = userDoc.data();
			const streakData = userData?.streak || {
				current: 0,
				longest: 0,
				lastStudiedOn: null,
				timezone: 'Africa/Accra'
			};
			const tz =
				timezone && isValidTimezone(timezone) ? timezone : streakData.timezone || 'Africa/Accra';

			// Format current time and yesterday's time in the target IANA timezone
			const getFormattedDate = (date: Date, timeZone: string): string => {
				const formatter = new Intl.DateTimeFormat('en-US', {
					timeZone,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				});
				const parts = formatter.formatToParts(date);
				const year = parts.find((p) => p.type === 'year')?.value;
				const month = parts.find((p) => p.type === 'month')?.value;
				const day = parts.find((p) => p.type === 'day')?.value;
				return `${year}-${month}-${day}`; // YYYY-MM-DD
			};

			const now = new Date();
			const today = getFormattedDate(now, tz);

			// Calculate yesterday date accurately by calendar day in target timezone
			const getYesterdayFormattedDate = (date: Date, timeZone: string): string => {
				const formatter = new Intl.DateTimeFormat('en-US', {
					timeZone,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				});
				const parts = formatter.formatToParts(date);
				const year = Number(parts.find((p) => p.type === 'year')?.value);
				const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
				const day = Number(parts.find((p) => p.type === 'day')?.value);

				const localMidday = new Date(Date.UTC(year, month, day, 12, 0, 0));
				localMidday.setUTCDate(localMidday.getUTCDate() - 1);

				const prevParts = formatter.formatToParts(localMidday);
				const pYear = prevParts.find((p) => p.type === 'year')?.value;
				const pMonth = prevParts.find((p) => p.type === 'month')?.value;
				const pDay = prevParts.find((p) => p.type === 'day')?.value;
				return `${pYear}-${pMonth}-${pDay}`;
			};
			const yesterday = getYesterdayFormattedDate(now, tz);

			const last = streakData.lastStudiedOn || null;
			let current = streakData.current || 0;
			let longest = streakData.longest || 0;
			let freezesAvailable =
				typeof streakData.freezesAvailable === 'number' ? streakData.freezesAvailable : 1;
			let freezeUsed = false;
			let extended: boolean;

			if (last === today) {
				// Already studied today: streak is safe but not extended
				extended = false;
			} else if (last === yesterday) {
				// Studied yesterday: extend the streak
				current += 1;
				extended = true;
			} else if (last && current > 0 && freezesAvailable > 0) {
				// Missed a day, but streak freeze mercy is available!
				freezesAvailable -= 1;
				freezeUsed = true;
				current += 1; // Preserve and extend streak
				extended = true;
			} else {
				// Churn/first study: reset streak to 1
				current = 1;
				extended = true;
			}

			longest = Math.max(longest, current);

			// Fetch existing badges
			const existingBadges: string[] = userData?.badges || [];
			const newBadges = new Set(existingBadges);

			// Evaluate Badges
			if (current >= 1) newBadges.add('First Step');
			if (current >= 3) newBadges.add('3-Day Streak');
			if (current >= 7) newBadges.add('7-Day Streak');
			if (current >= 14) newBadges.add('14-Day Streak');
			if (freezeUsed) newBadges.add('Streak Saver');

			const updatedBadges = Array.from(newBadges);

			let completedModuleIds: string[] = [];
			if (progressDoc.exists) {
				completedModuleIds = progressDoc.data()?.completedModuleIds || [];
			}

			if (!completedModuleIds.includes(moduleId)) {
				completedModuleIds.push(moduleId);
			}

			// Update User streak & badge stats
			transaction.update(userRef, {
				'streak.current': current,
				'streak.longest': longest,
				'streak.lastStudiedOn': today,
				'streak.timezone': tz,
				'streak.freezesAvailable': freezesAvailable,
				badges: updatedBadges,
				longestStreak: longest
			});

			// Save user progress document
			transaction.set(
				progressRef,
				{
					courseId,
					completedModuleIds,
					updatedAt: FieldValue.serverTimestamp()
				},
				{ merge: true }
			);

			// Save quiz attempt metric for admin analytics if quiz score provided
			if (
				typeof parsed.data.quizScore === 'number' &&
				typeof parsed.data.quizTotal === 'number' &&
				parsed.data.quizTotal > 0
			) {
				const accuracy = Math.round((parsed.data.quizScore / parsed.data.quizTotal) * 100);
				const quizAttemptRef = adminDb.collection('quizAttempts').doc();
				transaction.set(quizAttemptRef, {
					uid: user.uid,
					courseId,
					moduleId,
					score: parsed.data.quizScore,
					total: parsed.data.quizTotal,
					accuracy,
					createdAt: FieldValue.serverTimestamp()
				});
			}

			// Update denormalized course progress counters
			transaction.update(courseRef, {
				'progress.completed': completedModuleIds.length,
				updatedAt: FieldValue.serverTimestamp()
			});

			return { streak: { current, extended, freezeUsed, freezesAvailable } };
		});

		return json(result);
	} catch (err) {
		console.error('Complete module API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message === 'USER_NOT_FOUND') {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'User profile not found' } },
				{ status: 404 }
			);
		}
		if (message === 'COURSE_NOT_FOUND') {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}
		if (message === 'MODULE_NOT_FOUND') {
			return json({ error: { code: 'NOT_FOUND', message: 'Module not found' } }, { status: 404 });
		}
		if (message === 'FORBIDDEN') {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You do not own this course' } },
				{ status: 403 }
			);
		}
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
}
