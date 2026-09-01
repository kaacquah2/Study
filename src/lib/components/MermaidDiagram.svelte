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

	interface MermaidAPI {
		initialize: (config: Record<string, unknown>) => void;
		render: (id: string, code: string) => Promise<{ svg: string }>;
	}

	async function loadMermaid(): Promise<MermaidAPI | null> {
		if (typeof window === 'undefined') return null;
		const win = window as unknown as { mermaid?: MermaidAPI };
		if (win.mermaid) return win.mermaid;
		return new Promise((resolve) => {
			const existing = document.querySelector('script[src*="mermaid"]');
			if (existing) {
				existing.addEventListener('load', () => resolve(win.mermaid || null));
				if (win.mermaid) return resolve(win.mermaid);
			}
			const script = document.createElement('script');
			script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
			script.onload = () => resolve(win.mermaid || null);
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
	class="my-4 rounded-2xl p-4 overflow-x-auto border border-border bg-surface-muted/60 text-center"
>
	{#if svgContent}
		<div bind:this={container} class="flex items-center justify-center">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svgContent}
		</div>
	{:else if errorMsg}
		<div class="border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 rounded-xl border">
			<p class="font-bold">Diagram Code:</p>
			<pre class="mt-1 font-mono overflow-x-auto text-[11px]">{code}</pre>
		</div>
	{:else}
		<div class="gap-2 py-6 text-xs font-semibold flex items-center justify-center text-text-muted">
			<span class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
			></span>
			Rendering diagram...
		</div>
	{/if}
</div>
