<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AmbientCanvas from '$lib/components/AmbientCanvas.svelte';
	import CursorAura from '$lib/components/CursorAura.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<AmbientCanvas />
<CursorAura />
{@render children()}
