<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';

	interface Props {
		show: boolean;
		shareUrl: string;
		isPublic?: boolean;
		actionLoading?: boolean;
		courseTitle?: string;
		onClose: () => void;
		onRevoke?: () => void;
		onTogglePublic?: (isPublic: boolean) => void | Promise<void>;
	}

	let {
		show,
		shareUrl,
		isPublic = false,
		actionLoading = false,
		courseTitle = 'Course',
		onClose,
		onRevoke,
		onTogglePublic
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
		class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-text/50 p-4 backdrop-blur-xs"
		onclick={onClose}
	>
		<!-- Modal container, stopPropagation prevents click from propagating to backdrop -->
		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="share-modal-title"
			use:focusTrap={{
				onEscape: onClose,
				restoreFocus: true
			}}
			class="relative flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				type="button"
				class="absolute top-3 right-3 cursor-pointer rounded-full p-2.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
					class="h-4 w-4"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>

			<div>
				<h3 id="share-modal-title" class="mb-1 font-display text-lg font-bold text-text">
					Share {courseTitle}
				</h3>
				<p class="text-xs leading-relaxed text-text-muted">
					Send an independent copy of this course snapshot to classmates, or publish it to the
					community catalogue.
				</p>
			</div>

			<!-- Privacy & Visibility Selection -->
			{#if onTogglePublic}
				<div class="rounded-xl border border-border bg-surface-muted/60 p-3.5">
					<div class="mb-2 text-[11px] font-bold tracking-wider text-text-muted uppercase">
						Visibility
					</div>
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							onclick={() => onTogglePublic(false)}
							disabled={actionLoading}
							class="cursor-pointer rounded-xl border p-2.5 text-left transition-all {!isPublic
								? 'border-primary/50 bg-primary/10 text-primary'
								: 'border-border bg-surface text-text-muted hover:border-border/80'}"
						>
							<div class="flex items-center gap-1.5 text-xs font-bold">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
									/>
								</svg>
								Private Link
							</div>
							<p class="mt-1 text-[10px] leading-tight text-text-muted">
								Only people with the secret link can access
							</p>
						</button>

						<button
							type="button"
							onclick={() => onTogglePublic(true)}
							disabled={actionLoading}
							class="cursor-pointer rounded-xl border p-2.5 text-left transition-all {isPublic
								? 'border-primary/50 bg-primary/10 text-primary'
								: 'border-border bg-surface text-text-muted hover:border-border/80'}"
						>
							<div class="flex items-center gap-1.5 text-xs font-bold">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-3.5 w-3.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"
									/>
								</svg>
								Community
							</div>
							<p class="mt-1 text-[10px] leading-tight text-text-muted">
								Published to the public Explore catalogue
							</p>
						</button>
					</div>
				</div>
			{/if}

			<!-- Link copy block -->
			<div
				class="flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface-muted p-1"
			>
				<input
					type="text"
					readonly
					value={shareUrl}
					aria-label="Shareable course link"
					class="grow bg-transparent px-3 py-2 text-xs text-text select-all focus:outline-none"
				/>
				<button
					type="button"
					aria-label={copied ? 'Link copied to clipboard' : 'Copy share link to clipboard'}
					class="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition-all select-none hover:bg-primary-hover focus:outline-none active:scale-95"
					onclick={copyToClipboard}
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<!-- Revoke Actions -->
			<div class="mt-1 flex items-center justify-between border-t border-border pt-4">
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-lg p-2 text-xs font-semibold text-danger transition-all hover:bg-danger-soft focus:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
					</svg>
					Revoke sharing link
				</button>
				<button
					type="button"
					class="cursor-pointer rounded-xl bg-surface-muted px-4 py-2 text-xs font-semibold text-text-muted transition-all hover:bg-border hover:text-text focus:outline-none active:scale-95"
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
