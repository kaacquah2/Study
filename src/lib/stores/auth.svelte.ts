import { browser } from '$app/environment';
import { auth, db } from '$lib/firebase/client';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { themeStore, type Theme } from './theme.svelte';

export interface UserProfile {
	uid: string;
	email: string;
	displayName: string | null;
	photoURL: string | null;
	theme: Theme;
	role?: 'user' | 'admin' | 'superadmin';
	isAdmin?: boolean;
	isSuperAdmin?: boolean;
	badges?: string[];
	longestStreak?: number;
	streak: {
		current: number;
		longest: number;
		lastStudiedOn: string | null;
		timezone: string;
	};
}

class AuthStore {
	user = $state<FirebaseUser | null>(null);
	profile = $state<UserProfile | null>(null);
	loading = $state<boolean>(true);
	authResolved = $state<boolean>(false);

	private unsubscribeProfile: (() => void) | null = null;

	constructor() {
		if (browser) {
			const hasSession = localStorage.getItem('study_buddy_has_session') === 'true';
			const cachedProfile = localStorage.getItem('study_buddy_profile');

			if (hasSession) {
				this.loading = false;
				if (cachedProfile) {
					try {
						this.profile = JSON.parse(cachedProfile);
					} catch (e) {
						console.error('Failed to parse cached profile', e);
					}
				}
			}

			// Safety fallback: resolve auth loading state after timeout if Firebase is slow/offline
			setTimeout(() => {
				if (this.loading && !this.authResolved) {
					this.loading = false;
					this.authResolved = true;
				}
			}, 4000);

			onAuthStateChanged(auth, (firebaseUser) => {
				this.user = firebaseUser;

				// Clean up previous profile listener
				if (this.unsubscribeProfile) {
					this.unsubscribeProfile();
					this.unsubscribeProfile = null;
				}

				if (firebaseUser) {
					localStorage.setItem('study_buddy_has_session', 'true');

					// Listen to Firestore profile updates
					const userDoc = doc(db, 'users', firebaseUser.uid);
					this.unsubscribeProfile = onSnapshot(
						userDoc,
						(docSnap) => {
							if (docSnap.exists()) {
								const data = docSnap.data() as UserProfile;
								this.profile = data;
								localStorage.setItem('study_buddy_profile', JSON.stringify(data));

								// Synchronize client theme if it differs from the database profile
								if (data.theme && data.theme !== themeStore.current) {
									themeStore.setTheme(data.theme);
								}
							}
							this.loading = false;
							this.authResolved = true;
						},
						(error) => {
							console.error('Error listening to user profile:', error);
							this.loading = false;
							this.authResolved = true;
						}
					);
				} else {
					this.profile = null;
					this.loading = false;
					this.authResolved = true;
					localStorage.removeItem('study_buddy_has_session');
					localStorage.removeItem('study_buddy_profile');
				}
			});
		}
	}

	async logout() {
		if (this.unsubscribeProfile) {
			this.unsubscribeProfile();
			this.unsubscribeProfile = null;
		}
		localStorage.removeItem('study_buddy_has_session');
		localStorage.removeItem('study_buddy_profile');

		if (typeof window !== 'undefined' && 'caches' in window) {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			} catch (e) {
				console.warn('Failed to clear caches on logout:', e);
			}
		}

		await signOut(auth);
	}
}

export const authStore = new AuthStore();
