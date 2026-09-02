<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let aura: HTMLDivElement;
	function move(e: MouseEvent) {
		if (aura) {
			aura.style.transform = `translate(${e.clientX - 100}px, ${e.clientY - 100}px)`;
		}
	}

	onMount(() => {
		if (browser) {
			const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			let active = false;

			const updateListener = () => {
				if (motionMediaQuery.matches) {
					if (active) {
						document.removeEventListener('mousemove', move);
						active = false;
					}
				} else {
					if (!active) {
						document.addEventListener('mousemove', move);
						active = true;
					}
				}
			};

			updateListener();
			motionMediaQuery.addEventListener('change', updateListener);

			return () => {
				motionMediaQuery.removeEventListener('change', updateListener);
				if (active) {
					document.removeEventListener('mousemove', move);
				}
			};
		}
	});
</script>

<div bind:this={aura} class="cursor-aura"></div>
