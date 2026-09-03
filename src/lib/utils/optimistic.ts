import { toastStore } from '$lib/stores/toast.svelte';

export interface OptimisticOptions<T> {
	apply: () => void;
	revert: () => void;
	commit: () => Promise<T>;
	successMsg: string;
	undoMsg?: string;
}

/**
 * Executes an optimistic mutation with automated rollback and optional undo toast.
 */
export async function optimistic<T>({
	apply,
	revert,
	commit,
	successMsg,
	undoMsg
}: OptimisticOptions<T>): Promise<T> {
	apply();
	try {
		const result = await commit();
		toastStore.success(successMsg, 4500, undoMsg ? { label: undoMsg, fn: revert } : undefined);
		return result;
	} catch (e) {
		revert();
		toastStore.error(e instanceof Error ? e.message : 'Action failed. Changes reverted.');
		throw e;
	}
}
