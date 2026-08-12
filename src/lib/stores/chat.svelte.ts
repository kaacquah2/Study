class ChatStore {
	isOpen = $state(false);
	seedMessage = $state('');

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
}

export const chatStore = new ChatStore();
