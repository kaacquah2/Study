import { browser } from '$app/environment';
import { auth, db } from '$lib/firebase/client';
import { doc, updateDoc } from 'firebase/firestore';

export type Theme = 'light' | 'dark';

class ThemeStore {
	current = $state<Theme>('light');

	constructor() {
		if (browser) {
			const saved = localStorage.getItem('theme');
			if (saved === 'light' || saved === 'dark') {
				this.current = saved;
			} else if (saved === 'focus') {
				this.current = 'dark';
			} else {
				const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				this.current = systemPrefersDark ? 'dark' : 'light';
			}
			this.applyTheme(this.current);
		}
	}

	async setTheme(theme: Theme) {
		this.current = theme;
		if (browser) {
			localStorage.setItem('theme', theme);
			this.applyTheme(theme);

			// If authenticated, sync with Firestore profile
			if (auth.currentUser) {
				try {
					const userRef = doc(db, 'users', auth.currentUser.uid);
					await updateDoc(userRef, { theme });
				} catch (err) {
					console.warn('Failed to sync theme to Firestore:', err);
				}
			}
		}
	}

	private applyTheme(theme: Theme) {
		if (browser) {
			document.documentElement.setAttribute('data-theme', theme);
		}
	}
}

export const themeStore = new ThemeStore();
