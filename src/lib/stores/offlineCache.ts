/**
 * Utility for persisting active courses and lessons to localStorage / IndexedDB
 * for offline viewing when user loses internet connection.
 */

export interface OfflineCourseCache {
	id: string;
	title: string;
	description: string;
	cachedAt: number;
}

const STORAGE_KEY = 'offline_cached_courses';

export function saveCourseToOfflineCache(course: OfflineCourseCache): void {
	if (typeof window === 'undefined') return;
	try {
		const existing = getOfflineCachedCourses();
		const filtered = existing.filter((c) => c.id !== course.id);
		filtered.unshift(course);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
	} catch (e) {
		console.warn('Failed to save course to offline cache:', e);
	}
}

export function getOfflineCachedCourses(): OfflineCourseCache[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

export function isOffline(): boolean {
	if (typeof navigator === 'undefined') return false;
	return !navigator.onLine;
}
