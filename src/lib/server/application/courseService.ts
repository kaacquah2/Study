import { runWithSingleflight, getCachedOutline, invalidateCachedOutline } from '../outlineCache';
import { generateOutline, type CourseOutline } from '../ai/provider';

export interface GenerateOutlineParams {
	topic: string;
	moduleCount?: number;
	format?: 'lessons_and_quizzes' | 'quizzes_only';
	referenceText?: string;
	userId?: string;
}

export class CourseApplicationService {
	/**
	 * Retrieve course outline with singleflight deduplication and Redis caching.
	 */
	public async getOrGenerateOutline(
		courseId: string,
		generatorFn: () => Promise<CourseOutline>
	): Promise<CourseOutline> {
		return getCachedOutline<CourseOutline>(courseId, generatorFn);
	}

	/**
	 * Generate an outline with distributed singleflight locking to prevent duplicate simultaneous AI invocations.
	 */
	public async generateOutlineWithLock(params: GenerateOutlineParams): Promise<CourseOutline> {
		const lockKey = `outline_gen:${params.topic.toLowerCase().replace(/\s+/g, '_')}`;
		return runWithSingleflight<CourseOutline>(
			lockKey,
			async () => {
				const aiResult = await generateOutline(
					params.topic,
					params.moduleCount || 4,
					params.format || 'lessons_and_quizzes',
					params.referenceText,
					params.userId
				);
				return aiResult.result;
			},
			86400, // 24h cache
			45000 // 45s lock timeout with crash fallback
		);
	}

	/**
	 * Invalidate cached outline across L1 memory and L2 Redis.
	 */
	public invalidateOutline(courseId: string): void {
		invalidateCachedOutline(courseId);
	}
}

export const courseService = new CourseApplicationService();
