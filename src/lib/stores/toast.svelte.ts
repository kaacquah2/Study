export interface ToastMessage {
	id: string;
	type: 'success' | 'error' | 'info' | 'warning';
	message: string;
}

class ToastStore {
	toasts = $state<ToastMessage[]>([]);

	show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3500) {
		const id = Math.random().toString(36).substring(2, 9);
		this.toasts.push({ id, type, message });

		setTimeout(() => {
			this.remove(id);
		}, duration);
	}

	success(message: string, duration?: number) {
		this.show(message, 'success', duration);
	}

	error(message: string, duration?: number) {
		this.show(message, 'error', duration);
	}

	info(message: string, duration?: number) {
		this.show(message, 'info', duration);
	}

	warning(message: string, duration?: number) {
		this.show(message, 'warning', duration);
	}

	remove(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastStore = new ToastStore();
