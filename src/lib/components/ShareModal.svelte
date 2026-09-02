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

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && show) {
			onClose();
		}
	}}
/>

{#if show}
	<!-- Backdrop overlay, closes modal on click -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="animate-fade-in inset-0 p-4 backdrop-blur-xs fixed z-50 flex items-center justify-center bg-text/50"
		onclick={onClose}
	>
		<!-- Modal container, stopPropagation prevents click from propagating to backdrop -->
		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="share-modal-title"
			class="max-w-md gap-5 p-6 relative flex w-full flex-col rounded-lg border border-border bg-surface shadow-lg"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button (Touch target expanded to 44x44px via p-3, while maintaining icon style) -->
			<button
				type="button"
				class="top-2 right-2 p-3 absolute cursor-pointer rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
					aria-hidden="true"
					><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
				>
			</button>

			<div>
				<h3 id="share-modal-title" class="mb-1 font-display text-lg font-bold text-text">
					Share {courseTitle}
				</h3>
				<p class="text-xs leading-relaxed text-text-muted">
					Copy the link below and send it to your classmate. When they open it, an independent copy
					of this course will be cloned into their account.
				</p>
			</div>

			<!-- Link copy block -->
			<div
				class="gap-2 p-1 flex items-center overflow-hidden rounded-r-md border border-border bg-surface-muted"
			>
				<input
					type="text"
					readonly
					value={shareUrl}
					aria-label="Shareable course link"
					class="px-2 py-2 text-xs grow bg-transparent text-text select-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				/>
				<button
					type="button"
					aria-label={copied ? 'Link copied to clipboard' : 'Copy share link to clipboard'}
					class="px-4 py-2 text-xs font-bold text-white cursor-pointer rounded-r-md bg-primary transition-all select-none hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
					onclick={copyToClipboard}
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<!-- Revoke Actions -->
			<div class="mt-2 pt-4 flex items-center justify-between border-t border-border">
				<button
					type="button"
					class="gap-1.5 p-2 text-xs font-semibold flex cursor-pointer items-center rounded-sm text-danger transition-all hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
						aria-hidden="true"
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
					class="px-4 py-2 text-xs font-semibold cursor-pointer rounded-r-md bg-surface-muted text-text-muted transition-all hover:bg-border hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
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
	@media (prefers-reduced-motion: reduce) {
		.animate-fade-in {
			animation: none !important;
			transform: none !important;
		}
	}
</style>
