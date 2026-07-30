<script lang="ts">
	interface Props {
		current: number; // 1-indexed
		total: number;
		label?: string;
	}

	let { current, total, label = 'Page' }: Props = $props();

	let percentage = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
</script>

<div
	class="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text-muted shadow-xs"
>
	<span class="font-bold text-primary">{label} {current}</span>
	<span>of</span>
	<span class="font-bold text-text">{total}</span>
	<div class="ml-1 h-1.5 w-12 overflow-hidden rounded-full bg-surface-muted">
		<div
			class="h-full rounded-full bg-primary transition-all duration-300"
			style="width: {percentage}%"
		></div>
	</div>
</div>
