<script lang="ts">
	interface Props {
		variant?: 'card' | 'text' | 'title' | 'circle' | 'button';
		width?: string;
		height?: string;
		class?: string;
	}

	let { variant = 'text', width = 'w-full', height, class: className = '' }: Props = $props();

	let variantClasses = $derived.by(() => {
		switch (variant) {
			case 'card':
				return 'h-48 w-full rounded-2xl';
			case 'title':
				return 'h-7 w-3/4 rounded-lg';
			case 'circle':
				return 'h-10 w-10 rounded-full';
			case 'button':
				return 'h-10 w-32 rounded-xl';
			case 'text':
			default:
				return 'h-4 w-full rounded';
		}
	});
</script>

<div
	class="animate-pulse border border-border/40 bg-surface-muted select-none {variantClasses} {height
		? height
		: ''} {width ? width : ''} {className}"
></div>
