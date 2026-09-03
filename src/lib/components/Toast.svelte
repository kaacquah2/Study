<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
</script>

{#if toastStore.toasts.length > 0}
	<div
		role="region"
		aria-label="Notifications"
		aria-live="polite"
		class="pointer-events-none fixed right-6 bottom-6 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4"
	>
		{#each toastStore.toasts as toast (toast.id)}
			<div
				role="status"
				onmouseenter={() => toastStore.pause(toast.id)}
				onmouseleave={() => toastStore.resume(toast.id, 2500)}
				onfocusin={() => toastStore.pause(toast.id)}
				onfocusout={() => toastStore.resume(toast.id, 2500)}
				class="animate-slide-in pointer-events-auto flex items-center justify-between gap-3 rounded-xl border p-4 text-xs font-semibold shadow-xl transition-all duration-200 {toast.type ===
				'success'
					? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
					: toast.type === 'error'
						? 'border-rose-500/30 bg-rose-950/90 text-rose-200'
						: toast.type === 'warning'
							? 'border-amber-500/30 bg-amber-950/90 text-amber-200'
							: 'border-indigo-500/30 bg-indigo-950/90 text-indigo-200'}"
			>
				<div class="flex min-w-0 items-center gap-2.5">
					{#if toast.type === 'success'}
						<svg
							class="h-4 w-4 shrink-0 text-emerald-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2.5"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					{:else if toast.type === 'error'}
						<svg
							class="h-4 w-4 shrink-0 text-rose-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2.5"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{:else}
						<svg
							class="h-4 w-4 shrink-0 text-indigo-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2.5"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{/if}
					<span class="truncate">{toast.message}</span>
				</div>

				<div class="flex shrink-0 items-center gap-2">
					{#if toast.action}
						<button
							type="button"
							onclick={() => {
								toast.action?.fn();
								toastStore.remove(toast.id);
							}}
							class="cursor-pointer rounded-md bg-white/15 px-2 py-1 text-[11px] font-bold tracking-wider text-white uppercase transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-white active:bg-white/30"
						>
							{toast.action.label}
						</button>
					{/if}
					<button
						type="button"
						onclick={() => toastStore.remove(toast.id)}
						aria-label="Dismiss notification"
						class="cursor-pointer rounded-md p-1 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
					>
						&times;
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-slide-in {
		animation: slideIn 0.2s ease-out forwards;
	}
	@media (prefers-reduced-motion: reduce) {
		.animate-slide-in {
			animation: none !important;
			transform: none !important;
		}
	}
</style>
