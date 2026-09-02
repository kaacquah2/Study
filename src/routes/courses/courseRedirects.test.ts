import { describe, it, expect } from 'vitest';
import { load as loadCourse } from './[id]/+page';
import { load as loadLesson } from './[id]/lessons/[mid]/+page';
import { load as loadQuiz } from './[id]/quizzes/[mid]/+page';
import { load as loadComplete } from './[id]/complete/+page';

describe('Legacy Course Route Compatibility Redirects', () => {
	it('redirects /courses/[id] to /app/courses/[id] with 308 status', () => {
		try {
			loadCourse({
				params: { id: 'course-123' },
				url: new URL('https://example.com/courses/course-123?tab=overview')
			} as unknown as Parameters<typeof loadCourse>[0]);
			expect.unreachable('Should have thrown redirect');
		} catch (err: unknown) {
			const redirect = err as { status: number; location: string };
			expect(redirect.status).toBe(308);
			expect(redirect.location).toBe('/app/courses/course-123?tab=overview');
		}
	});

	it('redirects /courses/[id]/lessons/[mid] to /app/courses/[id]/[mid] with 308 status', () => {
		try {
			loadLesson({
				params: { id: 'course-123', mid: 'module-456' },
				url: new URL('https://example.com/courses/course-123/lessons/module-456')
			} as unknown as Parameters<typeof loadLesson>[0]);
			expect.unreachable('Should have thrown redirect');
		} catch (err: unknown) {
			const redirect = err as { status: number; location: string };
			expect(redirect.status).toBe(308);
			expect(redirect.location).toBe('/app/courses/course-123/module-456');
		}
	});

	it('redirects /courses/[id]/quizzes/[mid] to /app/courses/[id]/[mid] with 308 status', () => {
		try {
			loadQuiz({
				params: { id: 'course-123', mid: 'module-789' },
				url: new URL('https://example.com/courses/course-123/quizzes/module-789?retake=true')
			} as unknown as Parameters<typeof loadQuiz>[0]);
			expect.unreachable('Should have thrown redirect');
		} catch (err: unknown) {
			const redirect = err as { status: number; location: string };
			expect(redirect.status).toBe(308);
			expect(redirect.location).toBe('/app/courses/course-123/module-789?retake=true');
		}
	});

	it('redirects /courses/[id]/complete to /app/courses/[id] with 308 status', () => {
		try {
			loadComplete({
				params: { id: 'course-123' },
				url: new URL('https://example.com/courses/course-123/complete?type=quiz&score=5')
			} as unknown as Parameters<typeof loadComplete>[0]);
			expect.unreachable('Should have thrown redirect');
		} catch (err: unknown) {
			const redirect = err as { status: number; location: string };
			expect(redirect.status).toBe(308);
			expect(redirect.location).toBe('/app/courses/course-123?type=quiz&score=5');
		}
	});
});
