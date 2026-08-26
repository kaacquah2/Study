import { browser } from '$app/environment';

class ChatStore {
	isOpen = $state(false);
	isDocked = $state(false);
	dockWidth = $state(380); // Default 380px on desktop >= 1024px
	activeModuleId = $state('');
	seedMessage = $state('');

	constructor() {
		if (browser) {
			const savedDocked = localStorage.getItem('ai_chat_docked');
			if (savedDocked === 'true' && window.innerWidth >= 1024) {
				this.isDocked = true;
				this.isOpen = true;
			}
			const savedWidth = localStorage.getItem('ai_chat_dock_width');
			if (savedWidth) {
				const w = parseInt(savedWidth, 10);
				if (!isNaN(w) && w >= 300 && w <= 540) {
					this.dockWidth = w;
				}
			}
		}
	}

	openWithSeed(message: string) {
		this.seedMessage = message;
		this.isOpen = true;
	}

	toggle() {
		this.isOpen = !this.isOpen;
	}

	close() {
		this.isOpen = false;
	}

	setDocked(docked: boolean) {
		// Only allow docking on desktop >= 1024px
		if (docked && browser && window.innerWidth < 1024) {
			this.isDocked = false;
			return;
		}
		this.isDocked = docked;
		if (docked) {
			this.isOpen = true;
		}
		if (browser) {
			localStorage.setItem('ai_chat_docked', docked ? 'true' : 'false');
		}
	}

	setDockWidth(width: number) {
		// Clamped bounds: min 300px, max 540px
		const clamped = Math.max(300, Math.min(540, width));
		this.dockWidth = clamped;
		if (browser) {
			localStorage.setItem('ai_chat_dock_width', clamped.toString());
		}
	}
}

export const chatStore = new ChatStore();
