<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';

	interface Props {
		markdown: string;
	}

	let { markdown }: Props = $props();

	let renderedHtml = $derived.by(() => {
		if (!markdown) return '';
		return DOMPurify.sanitize(marked.parse(markdown) as string);
	});
</script>

<div class="prose prose-sm leading-relaxed max-w-none text-text">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html renderedHtml}
</div>
