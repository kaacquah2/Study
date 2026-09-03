import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { recordMistake, resolveMistake } from '$lib/server/analytics/mistakeRecords';
import { z } from 'zod';
import { handleServerError } from '$lib/server/apiError';

const CompleteModuleZod = z.object({
	courseId: z.string(),
	timezone: z.string().optional(),
	timeSpentSeconds: z.number().int().min(0).optional(),
	answers: z.array(z.number().int().min(0)).optional()
});

// POST /api/modules/[id]/complete
export const POST: RequestHandler = async (event) => {
	const { params, request } = event;
	const { id: moduleId } = params;

	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const parsed = CompleteModuleZod.safeParse(body);

		if (!parsed.success) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'Missing courseId or invalid payload' } },
				{ status: 400 }
			);
		}

		const { courseId, timezone, answers } = parsed.data;

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

			// Format date by calendar offset in the target IANA timezone
			const getOffsetFormattedDate = (
				date: Date,
				timeZone: string,
				dayOffset: number = 0
			): string => {
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
				if (dayOffset !== 0) {
					localMidday.setUTCDate(localMidday.getUTCDate() + dayOffset);
				}

				const targetParts = formatter.formatToParts(localMidday);
				const tYear = targetParts.find((p) => p.type === 'year')?.value;
				const tMonth = targetParts.find((p) => p.type === 'month')?.value;
				const tDay = targetParts.find((p) => p.type === 'day')?.value;
				return `${tYear}-${tMonth}-${tDay}`;
			};

			const now = new Date();
			const today = getOffsetFormattedDate(now, tz, 0);
			const yesterday = getOffsetFormattedDate(now, tz, -1);
			const dayBeforeYesterday = getOffsetFormattedDate(now, tz, -2);

			const last = streakData.lastStudiedOn || null;
			let current = streakData.current || 0;
			let longest = streakData.longest || 0;
			let freezesAvailable =
				typeof streakData.freezesAvailable === 'number' ? streakData.freezesAvailable : 1;
			let lastFreezeRefill = streakData.lastFreezeRefill || null;

			// Recurring weekly streak freeze replenishment (1 freeze every 7 days, up to MAX_FREEZES = 2)
			const MAX_FREEZES = 2;
			const REFILL_INTERVAL_DAYS = 7;

			if (!lastFreezeRefill) {
				lastFreezeRefill = today;
			} else {
				const refillDate = new Date(`${lastFreezeRefill}T12:00:00Z`);
				const todayDate = new Date(`${today}T12:00:00Z`);
				const daysElapsed = Math.floor(
					(todayDate.getTime() - refillDate.getTime()) / (1000 * 60 * 60 * 24)
				);
				if (daysElapsed >= REFILL_INTERVAL_DAYS) {
					const grants = Math.floor(daysElapsed / REFILL_INTERVAL_DAYS);
					if (freezesAvailable < MAX_FREEZES) {
						freezesAvailable = Math.min(MAX_FREEZES, freezesAvailable + grants);
					}
					lastFreezeRefill = today;
				}
			}

			let freezeUsed = false;
			let extended: boolean;

			if (last === today) {
				// Already studied today: streak is safe but not extended
				extended = false;
			} else if (last === yesterday) {
				// Studied yesterday: extend the streak
				current += 1;
				extended = true;
			} else if (last === dayBeforeYesterday && current > 0 && freezesAvailable > 0) {
				// Missed exactly one day (yesterday), but streak freeze mercy is available!
				freezesAvailable -= 1;
				freezeUsed = true;
				current += 1; // Preserve and extend streak
				extended = true;
			} else {
				// Churn/first study/gap > 1 day: reset streak to 1
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
				'streak.lastFreezeRefill': lastFreezeRefill,
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

			interface RawQuizQuestionDoc {
				order?: number;
				prompt?: string;
				question?: string;
				options?: string[];
				correctIndex?: number;
				answerIndex?: number;
				correct_index?: number;
				explanation?: string;
				conceptId?: string;
				conceptTag?: string;
			}

			// Server-side authoritative quiz grading
			const modData = moduleDoc.data();
			const questions: RawQuizQuestionDoc[] = (modData?.questions ??
				modData?.quiz?.questions ??
				[]) as RawQuizQuestionDoc[];

			let quizResult:
				| {
						score: number;
						total: number;
						accuracy: number;
						reviewItems: Array<{
							order: number;
							prompt: string;
							options: string[];
							correctIndex: number;
							selectedIndex: number;
							isCorrect: boolean;
							explanation: string;
							conceptId?: string;
						}>;
				  }
				| undefined = undefined;

			if (answers !== undefined) {
				if (answers.length !== questions.length) {
					throw new Error('ANSWER_COUNT_MISMATCH');
				}

				const reviewItems = questions.map((q, i: number) => {
					const correctIndex =
						typeof q.correctIndex === 'number'
							? q.correctIndex
							: typeof q.answerIndex === 'number'
								? q.answerIndex
								: typeof q.correct_index === 'number'
									? q.correct_index
									: 0;
					const selectedIndex = answers[i];
					const isCorrect = selectedIndex === correctIndex;

					return {
						order: q.order ?? i + 1,
						prompt: q.prompt || q.question || '',
						options: q.options || [],
						correctIndex,
						selectedIndex,
						isCorrect,
						explanation: q.explanation || '',
						conceptId: q.conceptId || q.conceptTag
					};
				});

				const quizScore = reviewItems.filter((item) => item.isCorrect).length;
				const quizTotal = questions.length;
				const accuracy = quizTotal > 0 ? Math.round((quizScore / quizTotal) * 100) : 0;

				quizResult = {
					score: quizScore,
					total: quizTotal,
					accuracy,
					reviewItems
				};

				// Save quiz attempt metric for admin analytics & audit trail
				const quizAttemptRef = adminDb.collection('quizAttempts').doc();
				transaction.set(quizAttemptRef, {
					uid: user.uid,
					courseId,
					moduleId,
					score: quizScore,
					total: quizTotal,
					accuracy,
					answers,
					createdAt: FieldValue.serverTimestamp()
				});
			}

			// Update denormalized course progress counters
			transaction.update(courseRef, {
				'progress.completed': completedModuleIds.length,
				updatedAt: FieldValue.serverTimestamp()
			});

			return {
				streak: { current, extended, freezeUsed, freezesAvailable },
				...(quizResult ? { quizResult } : {})
			};
		});

		// Asynchronously sync mistake records for quiz reviews without blocking response
		if (result.quizResult?.reviewItems) {
			for (const item of result.quizResult.reviewItems) {
				const questionId = `${moduleId}_q${item.order - 1}`;
				if (!item.isCorrect) {
					void recordMistake(
						user.uid,
						questionId,
						{
							prompt: item.prompt,
							options: item.options,
							correctIndex: item.correctIndex,
							explanation: item.explanation
						},
						item.selectedIndex,
						{
							conceptId: item.conceptId,
							moduleId,
							courseId
						}
					).catch((err) => console.warn('Failed to record mistake:', err));
				} else {
					void resolveMistake(user.uid, questionId).catch((err) =>
						console.warn('Failed to resolve mistake:', err)
					);
				}
			}
		}

		return json(result);
	} catch (err) {
		console.error('Complete module API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message === 'ANSWER_COUNT_MISMATCH') {
			return json(
				{
					error: {
						code: 'ANSWER_COUNT_MISMATCH',
						message: 'The number of submitted answers does not match the quiz questions count'
					}
				},
				{ status: 400 }
			);
		}
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
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event);
	}
};
