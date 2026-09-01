<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	let aura: HTMLDivElement;
	function move(e: MouseEvent) {
		aura.style.transform = `translate(${e.clientX - 100}px, ${e.clientY - 100}px)`;
	}
	onMount(() => {
		document.addEventListener('mousemove', move);
	});
	onDestroy(() => {
		document.removeEventListener('mousemove', move);
	});
</script>

<div bind:this={aura} class="cursor-aura"></div>
