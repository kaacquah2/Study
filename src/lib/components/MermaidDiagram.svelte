<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		code: string;
		id?: string;
	}

	let { code, id = `mermaid-${Math.random().toString(36).substring(2, 9)}` }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let errorMsg = $state<string | null>(null);
	let svgContent = $state<string>('');

	async function loadMermaid(): Promise<any> {
		if (typeof window === 'undefined') return null;
		if ((window as any).mermaid) return (window as any).mermaid;
		return new Promise((resolve) => {
			const existing = document.querySelector('script[src*="mermaid"]');
			if (existing) {
				existing.addEventListener('load', () => resolve((window as any).mermaid));
				if ((window as any).mermaid) return resolve((window as any).mermaid);
			}
			const script = document.createElement('script');
			script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
			script.onload = () => resolve((window as any).mermaid);
			script.onerror = () => resolve(null);
			document.head.appendChild(script);
		});
	}

	async function renderDiagram() {
		if (!code || typeof window === 'undefined') return;
		try {
			const mermaid = await loadMermaid();
			if (!mermaid) {
				errorMsg = 'Mermaid library unavailable';
				return;
			}
			mermaid.initialize({
				startOnLoad: false,
				theme: 'dark',
				securityLevel: 'loose'
			});
			const { svg } = await mermaid.render(id, code.trim());
			svgContent = svg;
			errorMsg = null;
		} catch (err) {
			console.warn('[MermaidDiagram] Render fallback:', err);
			errorMsg = err instanceof Error ? err.message : 'Could not render diagram';
		}
	}

	onMount(() => {
		renderDiagram();
	});

	$effect(() => {
		if (code) {
			renderDiagram();
		}
	});
</script>

<div
	class="my-4 overflow-x-auto rounded-2xl border border-border bg-surface-muted/60 p-4 text-center"
>
	{#if svgContent}
		<div bind:this={container} class="flex items-center justify-center">
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
