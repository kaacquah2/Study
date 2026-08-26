/**
 * Offline IndexedDB Storage & Review Log Buffer
 *
 * Manages local client storage for review cards and caches pending review events
 * when the application is offline.
 */

export interface OfflineReviewLog {
	id: string;
	cardId: string;
	rating: number; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
	reviewedAt: string;
	engine: 'fsrs';
	synced: boolean;
}

const DB_NAME = 'ai_study_buddy_offline';
const DB_VERSION = 1;
const STORE_REVIEWS = 'pending_reviews';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return reject(new Error('IndexedDB not supported in this environment'));
		}
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
				const store = db.createObjectStore(STORE_REVIEWS, { keyPath: 'id' });
				store.createIndex('synced', 'synced', { unique: false });
				store.createIndex('reviewedAt', 'reviewedAt', { unique: false });
			}
		};
	});
}

/**
 * Buffer a review completed while offline.
 */
export async function bufferOfflineReview(
	log: Omit<OfflineReviewLog, 'id' | 'synced'>
): Promise<string> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_REVIEWS, 'readwrite');
		const store = tx.objectStore(STORE_REVIEWS);
		const id = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
		const record: OfflineReviewLog = { ...log, id, synced: false };

		const req = store.add(record);
		req.onsuccess = () => resolve(id);
		req.onerror = () => reject(req.error);
	});
}

/**
 * Fetch all un-synced offline review logs sorted chronologically.
 */
export async function getPendingOfflineReviews(): Promise<OfflineReviewLog[]> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_REVIEWS, 'readonly');
		const store = tx.objectStore(STORE_REVIEWS);
		const req = store.getAll();

		req.onsuccess = () => {
			const results: OfflineReviewLog[] = req.result || [];
			const unsynced = results.filter((r) => !r.synced);
			unsynced.sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime());
			resolve(unsynced);
		};
		req.onerror = () => reject(req.error);
	});
}

/**
 * Mark offline reviews as synced.
 */
export async function markOfflineReviewsSynced(ids: string[]): Promise<void> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_REVIEWS, 'readwrite');
		const store = tx.objectStore(STORE_REVIEWS);

		for (const id of ids) {
			store.delete(id);
		}

		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
