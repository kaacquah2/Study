/**
 * Focus trap action for modal dialogs and popovers.
 * - Traps Tab and Shift+Tab focus within the container element.
 * - Auto-focuses the first focusable element (or specific initial focus element).
 * - Restores focus to the previously active element when destroyed or closed.
 * - Handles Escape key dismiss callback when specified.
 */
export interface FocusTrapOptions {
	enabled?: boolean;
	initialFocus?: HTMLElement | string | null;
	restoreFocus?: boolean;
	onEscape?: () => void;
}

const FOCUSABLE_SELECTOR = [
	'a[href]:not([tabindex="-1"])',
	'area[href]:not([tabindex="-1"])',
	'input:not([disabled]):not([tabindex="-1"])',
	'select:not([disabled]):not([tabindex="-1"])',
	'textarea:not([disabled]):not([tabindex="-1"])',
	'button:not([disabled]):not([tabindex="-1"])',
	'iframe:not([tabindex="-1"])',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable=true]:not([tabindex="-1"])'
].join(', ');

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	let enabled = options.enabled ?? true;
	let initialFocus = options.initialFocus ?? null;
	let restoreFocus = options.restoreFocus ?? true;
	let onEscape = options.onEscape;

	const previouslyActiveElement = (
		typeof document !== 'undefined' ? document.activeElement : null
	) as HTMLElement | null;

	function getFocusableElements(): HTMLElement[] {
		const elements = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
		return elements.filter((el) => {
			return (
				el.offsetParent !== null ||
				el.offsetWidth > 0 ||
				el.offsetHeight > 0 ||
				el === document.activeElement
			);
		});
	}

	function setInitialFocus() {
		if (!enabled) return;

		requestAnimationFrame(() => {
			if (initialFocus) {
				if (typeof initialFocus === 'string') {
					const el = node.querySelector<HTMLElement>(initialFocus);
					if (el) {
						el.focus();
						return;
					}
				} else if (initialFocus instanceof HTMLElement) {
					initialFocus.focus();
					return;
				}
			}

			const focusables = getFocusableElements();
			if (focusables.length > 0) {
				focusables[0].focus();
			} else {
				node.focus();
			}
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!enabled) return;

		if (event.key === 'Escape' && onEscape) {
			event.preventDefault();
			event.stopPropagation();
			onEscape();
			return;
		}

		if (event.key !== 'Tab') return;

		const focusables = getFocusableElements();
		if (focusables.length === 0) {
			event.preventDefault();
			return;
		}

		const firstElement = focusables[0];
		const lastElement = focusables[focusables.length - 1];

		if (event.shiftKey) {
			if (document.activeElement === firstElement || !node.contains(document.activeElement)) {
				event.preventDefault();
				lastElement.focus();
			}
		} else {
			if (document.activeElement === lastElement || !node.contains(document.activeElement)) {
				event.preventDefault();
				firstElement.focus();
			}
		}
	}

	if (enabled) {
		node.addEventListener('keydown', handleKeyDown);
		setInitialFocus();
	}

	return {
		update(newOptions: FocusTrapOptions = {}) {
			const wasEnabled = enabled;
			enabled = newOptions.enabled ?? true;
			initialFocus = newOptions.initialFocus ?? null;
			restoreFocus = newOptions.restoreFocus ?? true;
			onEscape = newOptions.onEscape;

			if (!wasEnabled && enabled) {
				node.addEventListener('keydown', handleKeyDown);
				setInitialFocus();
			} else if (wasEnabled && !enabled) {
				node.removeEventListener('keydown', handleKeyDown);
			}
		},
		destroy() {
			node.removeEventListener('keydown', handleKeyDown);
			if (
				restoreFocus &&
				previouslyActiveElement &&
				typeof previouslyActiveElement.focus === 'function'
			) {
				requestAnimationFrame(() => {
					previouslyActiveElement.focus();
				});
			}
		}
	};
}
