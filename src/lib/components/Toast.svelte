<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
</script>

{#if toastStore.toasts.length > 0}
	<div
		class="right-6 bottom-6 max-w-sm gap-2.5 px-4 pointer-events-none fixed z-50 flex w-full flex-col"
	>
		{#each toastStore.toasts as toast (toast.id)}
			<div
				class="animate-slide-in gap-3 p-4 text-xs font-semibold shadow-xl pointer-events-auto flex items-center justify-between rounded-xl border transition-all duration-200 {toast.type ===
				'success'
					? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
					: toast.type === 'error'
						? 'border-rose-500/30 bg-rose-950/90 text-rose-200'
						: toast.type === 'warning'
							? 'border-amber-500/30 bg-amber-950/90 text-amber-200'
							: 'border-indigo-500/30 bg-indigo-950/90 text-indigo-200'}"
			>
				<div class="gap-2.5 flex items-center">
					{#if toast.type === 'success'}
						<svg
							class="h-4 w-4 text-emerald-400 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
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
							class="h-4 w-4 text-rose-400 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
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
							class="h-4 w-4 text-indigo-400 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2.5"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{/if}
					<span>{toast.message}</span>
				</div>
				<button
					type="button"
					onclick={() => toastStore.remove(toast.id)}
					class="p-1 cursor-pointer rounded-md opacity-70 hover:opacity-100"
				>
					&times;
				</button>
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
</style>
