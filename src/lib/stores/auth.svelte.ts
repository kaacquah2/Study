import { browser } from '$app/environment';
import { auth, db } from '$lib/firebase/client';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { themeStore, type Theme } from './theme.svelte';
import { uiState } from './uiState.svelte';

export interface UserProfile {
	uid: string;
	email: string;
	displayName: string | null;
	photoURL: string | null;
	theme: Theme;
	role?: 'user' | 'admin' | 'superadmin';
	isAdmin?: boolean;
	isSuperAdmin?: boolean;
	isBanned?: boolean;
	bannedReason?: string | null;
	badges?: string[];
	longestStreak?: number;
	onboardingComplete?: boolean;
	streak: {
		current: number;
		longest: number;
		lastStudiedOn: string | null;
		timezone: string;
	};
}

export class AuthStore {
	user = $state<FirebaseUser | null>(null);
	profile = $state<UserProfile | null>(null);
	loading = $state<boolean>(true);
	authResolved = $state<boolean>(false);
	timedOut = $state<boolean>(false);

	private unsubscribeProfile: (() => void) | null = null;
	private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(autoInit: boolean = true) {
		if (browser && autoInit) {
			this.init();
		}
	}

	init() {
		const hasSession = localStorage.getItem('study_buddy_has_session') === 'true';
		const cachedProfile = localStorage.getItem('study_buddy_profile');

		if (hasSession && cachedProfile) {
			try {
				this.profile = JSON.parse(cachedProfile);
				if (import.meta.env.DEV && localStorage.getItem('study_buddy_mock_auth') === 'true') {
					this.user = {
						uid: this.profile?.uid || 'mock-user-1',
						email: this.profile?.email || 'test@example.com',
						displayName: this.profile?.displayName || 'Test User'
					} as FirebaseUser;
					this.loading = false;
					this.authResolved = true;
				}
			} catch (e) {
				console.error('Failed to parse cached profile', e);
			}
		}

		// Fallback timeout: if Firebase auth negotiation is slow/offline,
		// mark as timedOut WITHOUT falsely marking authResolved = true.
		if (!this.authResolved) {
			this.startTimeoutTimer(6000);
		}

		onAuthStateChanged(auth, (firebaseUser) => {
			this.clearTimeoutTimer();
			this.timedOut = false;

			if (firebaseUser) {
				this.user = firebaseUser;
				this.authResolved = true;
				this.loading = false;

				// Clean up previous profile listener
				if (this.unsubscribeProfile) {
					this.unsubscribeProfile();
					this.unsubscribeProfile = null;
				}

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
						} else if (!this.profile) {
							// Firestore document not yet created (new user between sign-up and
							// the first verifySessionUser API call which writes users/{uid} server-side).
							// Synthesize a provisional profile from Firebase auth data so the UI
							// never falls back to the generic "Student" placeholder.
							const emailHandle = firebaseUser.email?.split('@')[0] || null;
							this.profile = {
								uid: firebaseUser.uid,
								email: firebaseUser.email || '',
								displayName: firebaseUser.displayName || emailHandle,
								photoURL: firebaseUser.photoURL,
								theme: themeStore.current,
								role: 'user',
								streak: { current: 0, longest: 0, lastStudiedOn: null, timezone: 'UTC' }
							} as UserProfile;
						}
					},
					(error) => {
						console.error('Error listening to user profile:', error);
					}
				);
			} else if (
				import.meta.env.DEV &&
				localStorage.getItem('study_buddy_mock_auth') === 'true' &&
				this.user
			) {
				// Preserve mock user in fast client UI tests
				this.loading = false;
				this.authResolved = true;
			} else {
				this.user = null;
				this.profile = null;
				this.loading = false;
				this.authResolved = true;
				localStorage.removeItem('study_buddy_has_session');
				localStorage.removeItem('study_buddy_profile');
				localStorage.removeItem('wizard_draft_state');
			}
		});
	}

	startTimeoutTimer(ms: number = 6000) {
		this.clearTimeoutTimer();
		this.timeoutTimer = setTimeout(() => {
			if (this.loading && !this.authResolved && !this.user) {
				this.loading = false;
				this.timedOut = true;
				// Intentionally do NOT set this.authResolved = true here.
				// authResolved signifies definitive auth confirmation, not a network timeout.
			}
		}, ms);
	}

	clearTimeoutTimer() {
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = null;
		}
	}

	retry() {
		this.timedOut = false;
		this.loading = true;

		if (browser && auth?.currentUser) {
			this.user = auth.currentUser;
			this.loading = false;
			this.authResolved = true;
			return;
		}

		this.startTimeoutTimer(6000);
	}

	async logout() {
		this.clearTimeoutTimer();
		this.timedOut = false;

		const currentUid = this.user?.uid;
		if (currentUid) {
			uiState.clearAll(currentUid);
		}

		if (this.unsubscribeProfile) {
			this.unsubscribeProfile();
			this.unsubscribeProfile = null;
		}
		localStorage.removeItem('study_buddy_has_session');
		localStorage.removeItem('study_buddy_profile');
		localStorage.removeItem('wizard_draft_state');

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
