<script lang="ts">
	interface Props {
		show: boolean;
		shareUrl: string;
		actionLoading?: boolean;
		courseTitle?: string;
		onClose: () => void;
		onRevoke?: () => void;
	}

	let {
		show,
		shareUrl,
		actionLoading = false,
		courseTitle = 'Course',
		onClose,
		onRevoke
	}: Props = $props();

	let copied = $state(false);

	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy to clipboard', err);
		}
	};
</script>

{#if show}
	<!-- Backdrop overlay, closes modal on click -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-text/50 p-4 backdrop-blur-xs"
		onclick={onClose}
	>
		<!-- Modal container, stopPropagation prevents click from propagating to backdrop -->
		<div
			class="relative flex w-full max-w-md flex-col gap-5 rounded-lg border border-border bg-surface p-6 shadow-lg"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button (Touch target expanded to 44x44px via p-3, while maintaining icon style) -->
			<button
				type="button"
				class="absolute top-2 right-2 cursor-pointer rounded-full p-3 text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				onclick={onClose}
				aria-label="Close share dialog"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
					><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
				>
			</button>

			<div>
				<h3 class="mb-1 font-display text-lg font-bold text-text">Share {courseTitle}</h3>
				<p class="text-xs leading-relaxed text-text-muted">
					Copy the link below and send it to your classmate. When they open it, an independent copy
					of this course will be cloned into their account.
				</p>
			</div>

			<!-- Link copy block -->
			<div
				class="flex items-center gap-2 overflow-hidden rounded-r-md border border-border bg-surface-muted p-1"
			>
				<input
					type="text"
					readonly
					value={shareUrl}
					aria-label="Shareable course link"
					class="grow bg-transparent px-2 py-2 text-xs text-text select-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				/>
				<button
					type="button"
					class="cursor-pointer rounded-r-md bg-primary px-4 py-2 text-xs font-bold text-white transition-all select-none hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
					onclick={copyToClipboard}
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<!-- Revoke Actions -->
			<div class="mt-2 flex items-center justify-between border-t border-border pt-4">
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-sm p-2 text-xs font-semibold text-danger transition-all hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					onclick={onRevoke}
					disabled={actionLoading}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-3.5 w-3.5"
						><circle cx="12" cy="12" r="10" /><line
							x1="4.93"
							y1="4.93"
							x2="19.07"
							y2="19.07"
						/></svg
					>
					Revoke sharing link
				</button>
				<button
					type="button"
					class="cursor-pointer rounded-r-md bg-surface-muted px-4 py-2 text-xs font-semibold text-text-muted transition-all hover:bg-border hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
					onclick={onClose}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.animate-fade-in {
		animation: fadeIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
