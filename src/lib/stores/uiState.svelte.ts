/**
 * uiState — namespaced localStorage persistence for UI position state.
 *
 * Keys are namespaced by uid (`ui:{uid}:{key}`) to prevent cross-account
 * leakage when multiple users share a device.
 *
 * Usage:
 *   import { uiState } from '$lib/stores/uiState.svelte';
 *   const page = uiState.get(uid, `lesson:${lessonId}:page`, 0);
 *   uiState.set(uid, `lesson:${lessonId}:page`, 3);
 *
 * Call uiState.clearAll(uid) in authStore.logout() to wipe all state
 * on sign-out and prevent previous user's UI position leaking to the next.
 */

import { browser } from '$app/environment';

const storageKey = (uid: string, k: string) => `ui:${uid}:${k}`;

export const uiState = {
	/**
	 * Read a persisted UI value.
	 * Returns `fallback` if the key is absent or unparseable.
	 */
	get<T>(uid: string, k: string, fallback: T): T {
		if (!browser) return fallback;
		try {
			const raw = localStorage.getItem(storageKey(uid, k));
			if (raw === null) return fallback;
			return JSON.parse(raw) as T;
		} catch {
			return fallback;
		}
	},

	/**
	 * Persist a UI value.
	 */
	set(uid: string, k: string, v: unknown): void {
		if (!browser) return;
		try {
			localStorage.setItem(storageKey(uid, k), JSON.stringify(v));
		} catch {
			// Storage quota exceeded — silently ignore.
		}
	},

	/**
	 * Remove a single persisted key.
	 */
	remove(uid: string, k: string): void {
		if (!browser) return;
		localStorage.removeItem(storageKey(uid, k));
	},

	/**
	 * Clear ALL persisted UI state for this user.
	 * Must be called from authStore.logout() to prevent cross-account leakage.
	 */
	clearAll(uid: string): void {
		if (!browser) return;
		const prefix = `ui:${uid}:`;
		Object.keys(localStorage)
			.filter((k) => k.startsWith(prefix))
			.forEach((k) => localStorage.removeItem(k));
	}
};
