<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { children } = $props();

	onMount(() => {
		if (browser && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch((err) => {
				console.warn('Service worker registration failed:', err);
			});
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- AmbientCanvas and CursorAura removed: ambient effects contribute to AI-SaaS fingerprint
     and burn CPU for no educational benefit. -->
{@render children()}
