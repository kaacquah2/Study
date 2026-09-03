export interface ToastAction {
	label: string;
	fn: () => void;
}

export interface ToastMessage {
	id: string;
	type: 'success' | 'error' | 'info' | 'warning';
	message: string;
	action?: ToastAction;
	duration?: number;
}

class ToastStore {
	toasts = $state<ToastMessage[]>([]);
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	show(
		message: string,
		type: 'success' | 'error' | 'info' | 'warning' = 'info',
		duration = 3500,
		action?: ToastAction
	) {
		const id = Math.random().toString(36).substring(2, 9);
		const toast: ToastMessage = { id, type, message, action, duration };
		this.toasts.push(toast);

		this.scheduleDismiss(id, duration);
		return id;
	}

	scheduleDismiss(id: string, duration = 3500) {
		this.clearDismissTimer(id);
		const timer = setTimeout(() => {
			this.remove(id);
		}, duration);
		this.timers.set(id, timer);
	}

	clearDismissTimer(id: string) {
		const existing = this.timers.get(id);
		if (existing) {
			clearTimeout(existing);
			this.timers.delete(id);
		}
	}

	pause(id: string) {
		this.clearDismissTimer(id);
	}

	resume(id: string, remaining = 2000) {
		this.scheduleDismiss(id, remaining);
	}

	success(message: string, duration?: number, action?: ToastAction) {
		this.show(message, 'success', duration, action);
	}

	error(message: string, duration?: number, action?: ToastAction) {
		this.show(message, 'error', duration, action);
	}

	info(message: string, duration?: number, action?: ToastAction) {
		this.show(message, 'info', duration, action);
	}

	warning(message: string, duration?: number, action?: ToastAction) {
		this.show(message, 'warning', duration, action);
	}

	remove(id: string) {
		this.clearDismissTimer(id);
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastStore = new ToastStore();
