<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	interface Props {
		style: 'tip' | 'warning' | 'example' | 'deep-dive';
		title: string;
		markdown: string;
	}

	let { style, title, markdown }: Props = $props();
	let isOpen = $state(true);

	let renderedHtml = $derived.by(() => {
		if (!markdown) return '';
		return DOMPurify.sanitize(marked.parse(markdown) as string);
	});

	const styleClasses = {
		tip: {
			border: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
			icon: '💡',
			accent: 'text-emerald-600 dark:text-emerald-400'
		},
		warning: {
			border: 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100',
			icon: '⚠️',
			accent: 'text-amber-600 dark:text-amber-400'
		},
		example: {
			border: 'border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-100',
			icon: '📝',
			accent: 'text-sky-600 dark:text-sky-400'
		},
		'deep-dive': {
			border: 'border-purple-500/30 bg-purple-500/10 text-purple-950 dark:text-purple-100',
			icon: '🔬',
			accent: 'text-purple-600 dark:text-purple-400'
		}
	};

	let currentStyle = $derived(styleClasses[style] || styleClasses.tip);
</script>

<div class="my-4 rounded-2xl overflow-hidden border {currentStyle.border} transition-all">
	<button
		type="button"
		onclick={() => (isOpen = !isOpen)}
		class="p-3.5 text-xs font-bold flex w-full cursor-pointer items-center justify-between text-left"
	>
		<div class="gap-2 flex items-center">
			<span>{currentStyle.icon}</span>
			<span class={currentStyle.accent}>{title}</span>
		</div>
		<span class="text-text-muted transition-transform duration-200 {isOpen ? 'rotate-180' : ''}">
			▼
		</span>
	</button>

	{#if isOpen}
		<div class="px-4 py-3 text-xs leading-relaxed border-t border-border/20">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderedHtml}
		</div>
	{/if}
</div>
