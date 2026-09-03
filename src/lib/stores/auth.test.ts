import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthStore } from './auth.svelte';

describe('AuthStore - Timeout & Resolution Race Handling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('initializes with loading=true, authResolved=false, and timedOut=false', () => {
		const store = new AuthStore(false);
		expect(store.loading).toBe(true);
		expect(store.authResolved).toBe(false);
		expect(store.timedOut).toBe(false);
		expect(store.user).toBeNull();
	});

	it('distinguishes timeout from resolution as signed-out', () => {
		const store = new AuthStore(false);

		// Start fallback timeout
		store.startTimeoutTimer(6000);

		// Before timeout
		vi.advanceTimersByTime(3000);
		expect(store.loading).toBe(true);
		expect(store.timedOut).toBe(false);
		expect(store.authResolved).toBe(false);

		// Fire timeout
		vi.advanceTimersByTime(3001);
		expect(store.loading).toBe(false);
		expect(store.timedOut).toBe(true);
		// CRITICAL: authResolved must NOT be true when timed out
		expect(store.authResolved).toBe(false);
		expect(store.user).toBeNull();
	});

	it('resets timeout state and re-enters loading on retry()', () => {
		const store = new AuthStore(false);
		store.startTimeoutTimer(6000);
		vi.advanceTimersByTime(6000);

		expect(store.timedOut).toBe(true);
		expect(store.loading).toBe(false);

		// Invoke retry
		store.retry();

		expect(store.timedOut).toBe(false);
		expect(store.loading).toBe(true);
		expect(store.authResolved).toBe(false);

		// Advanced timers again without resolution -> should time out again
		vi.advanceTimersByTime(6000);
		expect(store.timedOut).toBe(true);
		expect(store.loading).toBe(false);
		expect(store.authResolved).toBe(false);
	});

	it('clears timeout when user state is successfully resolved', () => {
		const store = new AuthStore(false);
		store.startTimeoutTimer(6000);

		// Simulate authenticated resolution before timeout expires
		store.clearTimeoutTimer();
		store.timedOut = false;
		store.user = {
			uid: 'user-123',
			email: 'test@example.com'
		} as unknown as import('firebase/auth').User;
		store.authResolved = true;
		store.loading = false;

		vi.advanceTimersByTime(7000);

		expect(store.timedOut).toBe(false);
		expect(store.authResolved).toBe(true);
		expect(store.loading).toBe(false);
		expect(store.user?.uid).toBe('user-123');
	});

	it('clears timeout and sets authResolved=true when definitively signed-out', () => {
		const store = new AuthStore(false);
		store.startTimeoutTimer(6000);

		// Simulate definitive unauthenticated state from Firebase
		store.clearTimeoutTimer();
		store.timedOut = false;
		store.user = null;
		store.authResolved = true;
		store.loading = false;

		vi.advanceTimersByTime(7000);

		expect(store.timedOut).toBe(false);
		expect(store.authResolved).toBe(true);
		expect(store.loading).toBe(false);
		expect(store.user).toBeNull();
	});
});
