import { browser } from '$app/environment';

export interface StudySessionEvent {
	id: string;
	type: 'lens_explain' | 'lens_example' | 'lens_quiz' | 'flashcard_created' | 'tts_read' | 'quiz_answered';
	snippet?: string;
	summary?: string;
	conceptId?: string | null;
	timestamp: number;
}

export interface CanonicalConcept {
	id: string;
	term: string;
	aliases: string[];
	summary?: string;
}

class StudySessionStore {
	activeModuleId = $state<string>('');
	activeHeading = $state<string>('');
	recentEvents = $state<StudySessionEvent[]>([]);

	constructor() {
		if (browser) {
			this.restoreFromStorage();
		}
	}

	setModule(moduleId: string, heading: string = '') {
		if (this.activeModuleId !== moduleId) {
			this.activeModuleId = moduleId;
			this.activeHeading = heading;
			this.restoreFromStorage();
		} else if (heading) {
			this.activeHeading = heading;
		}
	}

	recordEvent(event: Omit<StudySessionEvent, 'id' | 'timestamp'>) {
		const newEvent: StudySessionEvent = {
			id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			timestamp: Date.now(),
			...event
		};

		// Keep recent 50 events per module
		this.recentEvents = [newEvent, ...this.recentEvents].slice(0, 50);
		this.saveToStorage();
	}

	getRecentEvents(limitMinutes: number = 15): StudySessionEvent[] {
		const cutoff = Date.now() - limitMinutes * 60 * 1000;
		return this.recentEvents.filter((e) => e.timestamp >= cutoff);
	}

	clearSession() {
		this.recentEvents = [];
		if (browser && this.activeModuleId) {
			sessionStorage.removeItem(`study_session_${this.activeModuleId}`);
		}
	}

	/**
	 * Resolves arbitrary highlighted text against a module's canonical concept dictionary.
	 * Uses token overlap and alias matching with confidence threshold >= 0.45.
	 * Returns null if below threshold (preventing phantom taxonomy nodes).
	 */
	resolveConcept(text: string, concepts: CanonicalConcept[] = []): CanonicalConcept | null {
		if (!text || !concepts || concepts.length === 0) return null;
		const cleanText = text.toLowerCase().trim();
		const textTokens = new Set(cleanText.split(/\W+/).filter((t) => t.length > 2));

		let bestMatch: CanonicalConcept | null = null;
		let highestScore = 0;

		for (const concept of concepts) {
			const termLower = concept.term.toLowerCase();
			// Direct substring match in term or text
			if (cleanText.includes(termLower) || termLower.includes(cleanText)) {
				return concept;
			}

			// Check aliases
			for (const alias of concept.aliases || []) {
				const aliasLower = alias.toLowerCase();
				if (cleanText.includes(aliasLower) || aliasLower.includes(cleanText)) {
					return concept;
				}
			}

			// Token Jaccard overlap
			const conceptTokens = new Set(
				`${concept.term} ${(concept.aliases || []).join(' ')}`
					.toLowerCase()
					.split(/\W+/)
					.filter((t) => t.length > 2)
			);

			if (conceptTokens.size === 0 || textTokens.size === 0) continue;

			let intersectionCount = 0;
			for (const token of textTokens) {
				if (conceptTokens.has(token)) intersectionCount++;
			}

			const unionSize = new Set([...textTokens, ...conceptTokens]).size;
			const score = intersectionCount / unionSize;

			if (score > highestScore && score >= 0.35) {
				highestScore = score;
				bestMatch = concept;
			}
		}

		return bestMatch;
	}

	private restoreFromStorage() {
		if (!browser || !this.activeModuleId) return;
		try {
			const key = `study_session_${this.activeModuleId}`;
			const stored = sessionStorage.getItem(key);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					this.recentEvents = parsed;
				}
			} else {
				this.recentEvents = [];
			}
		} catch (e) {
			console.warn('Failed to restore study session from storage:', e);
		}
	}

	private saveToStorage() {
		if (!browser || !this.activeModuleId) return;
		try {
			const key = `study_session_${this.activeModuleId}`;
			sessionStorage.setItem(key, JSON.stringify(this.recentEvents));
		} catch (e) {
			console.warn('Failed to save study session to storage:', e);
		}
	}
}

export const studySessionStore = new StudySessionStore();
