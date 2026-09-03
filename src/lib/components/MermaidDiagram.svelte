<script lang="ts">
	import { browser } from '$app/environment';
	import mermaid from 'mermaid';
	import DOMPurify from 'isomorphic-dompurify';
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Props {
		code: string;
		id?: string;
	}

	let { code, id }: Props = $props();

	let errorMsg = $state<string | null>(null);
	let svgContent = $state<string>('');
	let renderSeq = 0;

	async function renderDiagram() {
		if (!code || !browser) return;
		try {
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: themeStore.current === 'dark' ? 'dark' : 'default'
			});
			const renderId = id || `mermaid-diagram-${++renderSeq}`;
			const { svg } = await mermaid.render(renderId, code.trim());
			svgContent = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
			errorMsg = null;
		} catch (err) {
			console.warn('[MermaidDiagram] Render fallback:', err);
			errorMsg = err instanceof Error ? err.message : 'Could not render diagram';
		}
	}

	$effect(() => {
		if (code) {
			void themeStore.current;
			renderDiagram();
		}
	});
</script>

<div
	class="my-4 overflow-x-auto rounded-2xl border border-border bg-surface-muted/60 p-4 text-center"
>
	{#if svgContent}
		<div class="flex items-center justify-center">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svgContent}
		</div>
	{:else if errorMsg}
		<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
			<p class="font-bold">Diagram Code:</p>
			<pre class="mt-1 overflow-x-auto font-mono text-[11px]">{code}</pre>
		</div>
	{:else}
		<div class="flex items-center justify-center gap-2 py-6 text-xs font-semibold text-text-muted">
			<span class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
			></span>
			Rendering diagram...
		</div>
	{/if}
</div>
