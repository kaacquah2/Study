<script lang="ts">
	interface Props {
		term: string;
		definition: string;
	}

	let { term, definition }: Props = $props();
	let showPopover = $state(false);
</script>

<span class="relative inline-block">
	<button
		type="button"
		onclick={() => (showPopover = !showPopover)}
		class="inline-flex cursor-pointer items-center gap-1 rounded-md border-b-2 border-dashed border-primary/60 bg-primary-soft/30 px-1.5 py-0.5 font-medium text-primary hover:border-primary hover:bg-primary-soft active:scale-95"
		title="Tap for definition"
	>
		<span>{term}</span>
		<span class="text-[10px] opacity-70">🔍</span>
	</button>

	{#if showPopover}
		<div
			class="animate-fade-in absolute bottom-full left-0 z-30 mb-2 w-64 rounded-2xl border border-border bg-surface p-3 text-xs shadow-xl backdrop-blur-md"
		>
			<div
				class="flex items-center justify-between border-b border-border/40 pb-1.5 font-bold text-primary"
			>
				<span>📖 Definition: {term}</span>
				<button
					type="button"
					onclick={() => (showPopover = false)}
					class="text-text-muted hover:text-text"
				>
					✕
				</button>
			</div>
			<p class="mt-1.5 text-[11px] leading-relaxed text-text">{definition}</p>
		</div>
	{/if}
</span>
