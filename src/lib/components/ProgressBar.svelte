<script lang="ts">
	interface Props {
		progress: number; // 0 to 100
		height?: string;
		showLabel?: boolean;
		label?: string;
		accent?: 'violet' | 'amber' | 'emerald' | 'primary';
		class?: string;
	}

	let {
		progress = 0,
		height = 'h-2',
		showLabel = false,
		label,
		accent = 'primary',
		class: className = ''
	}: Props = $props();

	let safeProgress = $derived(Math.min(100, Math.max(0, progress)));

	let accentGradient = $derived.by(() => {
		switch (accent) {
			case 'violet':
				return 'bg-linear-to-r from-purple-500 to-indigo-500';
			case 'amber':
				return 'bg-linear-to-r from-amber-400 to-orange-500';
			case 'emerald':
				return 'bg-linear-to-r from-emerald-400 to-teal-500';
			case 'primary':
			default:
				return 'bg-linear-to-r from-indigo-500 to-purple-600';
		}
	});
</script>

<div class="w-full {className}">
	{#if showLabel || label}
		<div class="mb-1.5 text-xs font-semibold flex items-center justify-between">
			<span class="text-text-muted">{label || 'Progress'}</span>
			<span class="font-bold text-text">{Math.round(safeProgress)}%</span>
		</div>
	{/if}

	<div
		class="w-full overflow-hidden rounded-full border border-border/40 bg-surface-muted {height}"
	>
		<div
			class="ease-out h-full rounded-full transition-all duration-500 {accentGradient}"
			style="width: {safeProgress}%"
		></div>
	</div>
</div>
