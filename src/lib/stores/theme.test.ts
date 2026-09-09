import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/firebase/client', () => ({
	auth: { currentUser: null },
	db: {}
}));

class MockClassList {
	classes = new Set<string>();
	add(cls: string) {
		this.classes.add(cls);
	}
	remove(cls: string) {
		this.classes.delete(cls);
	}
	contains(cls: string) {
		return this.classes.has(cls);
	}
}

class MockElement {
	classList = new MockClassList();
	attributes: Record<string, string> = {};
	setAttribute(name: string, val: string) {
		this.attributes[name] = val;
	}
	getAttribute(name: string) {
		return this.attributes[name] || null;
	}
	removeAttribute(name: string) {
		delete this.attributes[name];
	}
}

let mockStorage: Record<string, string> = {};
const mockDocEl = new MockElement();

vi.stubGlobal('localStorage', {
	getItem: (key: string) => mockStorage[key] || null,
	setItem: (key: string, val: string) => {
		mockStorage[key] = val;
	},
	removeItem: (key: string) => {
		delete mockStorage[key];
	},
	clear: () => {
		mockStorage = {};
	}
});

vi.stubGlobal('document', {
	documentElement: mockDocEl
});

let systemPrefersDark = false;
vi.stubGlobal('window', {
	matchMedia: (query: string) => ({
		matches: query.includes('dark') ? systemPrefersDark : false
	})
});

import { ThemeStore } from './theme.svelte';

describe('ThemeStore', () => {
	beforeEach(() => {
		mockStorage = {};
		mockDocEl.classList.classes.clear();
		mockDocEl.attributes = {};
		systemPrefersDark = false;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('initializes with default light theme when no preference or saved value exists', () => {
		systemPrefersDark = false;
		const store = new ThemeStore();
		expect(store.current).toBe('light');
		expect(mockDocEl.getAttribute('data-theme')).toBe('light');
		expect(mockDocEl.classList.contains('light')).toBe(true);
		expect(mockDocEl.classList.contains('dark')).toBe(false);
	});

	it('initializes with dark theme when system prefers dark mode', () => {
		systemPrefersDark = true;
		const store = new ThemeStore();
		expect(store.current).toBe('dark');
		expect(mockDocEl.getAttribute('data-theme')).toBe('dark');
		expect(mockDocEl.classList.contains('dark')).toBe(true);
		expect(mockDocEl.classList.contains('light')).toBe(false);
	});

	it('initializes with saved theme from localStorage', () => {
		mockStorage['theme'] = 'dark';
		const store = new ThemeStore();
		expect(store.current).toBe('dark');
		expect(mockDocEl.getAttribute('data-theme')).toBe('dark');
		expect(mockDocEl.classList.contains('dark')).toBe(true);
	});

	it('initializes with legacy study_buddy_theme key if present in localStorage', () => {
		mockStorage['study_buddy_theme'] = 'dark';
		const store = new ThemeStore();
		expect(store.current).toBe('dark');
		expect(mockDocEl.getAttribute('data-theme')).toBe('dark');
		expect(mockDocEl.classList.contains('dark')).toBe(true);
	});

	it('toggles theme between light and dark correctly with class and attribute sync', async () => {
		const store = new ThemeStore();

		await store.setTheme('dark');
		expect(store.current).toBe('dark');
		expect(mockStorage['theme']).toBe('dark');
		expect(mockDocEl.getAttribute('data-theme')).toBe('dark');
		expect(mockDocEl.classList.contains('dark')).toBe(true);
		expect(mockDocEl.classList.contains('light')).toBe(false);

		await store.setTheme('light');
		expect(store.current).toBe('light');
		expect(mockStorage['theme']).toBe('light');
		expect(mockDocEl.getAttribute('data-theme')).toBe('light');
		expect(mockDocEl.classList.contains('dark')).toBe(false);
		expect(mockDocEl.classList.contains('light')).toBe(true);
	});
});
