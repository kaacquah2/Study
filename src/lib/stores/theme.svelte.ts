import { browser } from '$app/environment';
import { auth, db } from '$lib/firebase/client';
import { doc, updateDoc } from 'firebase/firestore';

export type Theme = 'light' | 'dark';

export class ThemeStore {
	current = $state<Theme>('light');

	constructor() {
		if (browser) {
			const saved =
				typeof localStorage !== 'undefined'
					? localStorage.getItem('theme') || localStorage.getItem('study_buddy_theme')
					: null;
			if (saved === 'light' || saved === 'dark') {
				this.current = saved;
			} else if (saved === 'focus') {
				this.current = 'dark';
			} else if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
				const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				this.current = systemPrefersDark ? 'dark' : 'light';
			} else {
				this.current = 'light';
			}
			this.applyTheme(this.current);
		}
	}

	async setTheme(theme: Theme) {
		this.current = theme;
		if (browser) {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', theme);
			}
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

	public applyTheme(theme: Theme) {
		if (browser && typeof document !== 'undefined' && document.documentElement) {
			document.documentElement.setAttribute('data-theme', theme);
			if (theme === 'dark') {
				document.documentElement.classList.add('dark');
				document.documentElement.classList.remove('light');
			} else {
				document.documentElement.classList.remove('dark');
				document.documentElement.classList.add('light');
			}
		}
	}
}

export const themeStore = new ThemeStore();
