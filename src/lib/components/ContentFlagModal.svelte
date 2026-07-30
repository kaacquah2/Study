<script lang="ts">
	interface Props {
		isOpen: boolean;
		courseId: string;
		moduleId?: string | null;
		contentType: 'lesson' | 'quiz' | 'course' | 'chat';
		onClose: () => void;
	}

	let { isOpen, courseId, moduleId = null, contentType, onClose }: Props = $props();

	let reason = $state('');
	let isSubmitting = $state(false);
	let successMessage = $state('');
	let errorMessage = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!reason.trim()) return;

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const res = await fetch('/api/flag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					courseId,
					moduleId,
					contentType,
					reason: reason.trim()
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error?.message || 'Failed to submit flag');
			}

			successMessage =
				'Thank you for your feedback! Our content review team has logged this report.';
			setTimeout(() => {
				reason = '';
				successMessage = '';
				onClose();
			}, 1800);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Error submitting report';
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
		<div
			class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800"
			>
				<h3 class="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
					<span>🚩 Report Issue</span>
					<span
						class="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-800 uppercase dark:bg-amber-900/40 dark:text-amber-300"
					>
						{contentType}
					</span>
				</h3>
				<button
					onclick={onClose}
					class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
				>
					✕
				</button>
			</div>

			{#if successMessage}
				<div
					class="my-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
				>
					{successMessage}
				</div>
			{:else}
				<form onsubmit={handleSubmit} class="mt-4 space-y-4">
					<div>
						<label
							for="flag-reason"
							class="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
						>
							Why are you flagging this content?
						</label>
						<textarea
							id="flag-reason"
							bind:value={reason}
							required
							rows={4}
							placeholder="e.g. Inaccurate formula, misleading answer option in quiz, formatting issue..."
							class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
						></textarea>
					</div>

					{#if errorMessage}
						<p class="text-xs text-rose-600 dark:text-rose-400">{errorMessage}</p>
					{/if}

					<div class="flex justify-end gap-2 pt-2">
						<button
							type="button"
							onclick={onClose}
							class="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSubmitting || !reason.trim()}
							class="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
						>
							{isSubmitting ? 'Submitting...' : 'Submit Report'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}
