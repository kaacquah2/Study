<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let aura: HTMLDivElement;
	let rafId: number | null = null;
	let mouseX = 0;
	let mouseY = 0;

	function move(e: MouseEvent) {
		mouseX = e.clientX;
		mouseY = e.clientY;
		if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				if (aura) {
					aura.style.transform = `translate(${mouseX - 100}px, ${mouseY - 100}px)`;
				}
				rafId = null;
			});
		}
	}

	onMount(() => {
		if (browser) {
			const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			const pointerMediaQuery = window.matchMedia('(pointer: fine)');
			let active = false;

			const updateListener = () => {
				const shouldBeActive = pointerMediaQuery.matches && !motionMediaQuery.matches;
				if (shouldBeActive) {
					if (!active) {
						document.addEventListener('mousemove', move, { passive: true });
						active = true;
					}
				} else {
					if (active) {
						document.removeEventListener('mousemove', move);
						active = false;
						if (rafId !== null) {
							cancelAnimationFrame(rafId);
							rafId = null;
						}
					}
				}
			};

			updateListener();
			motionMediaQuery.addEventListener('change', updateListener);
			pointerMediaQuery.addEventListener('change', updateListener);

			return () => {
				motionMediaQuery.removeEventListener('change', updateListener);
				pointerMediaQuery.removeEventListener('change', updateListener);
				if (active) {
					document.removeEventListener('mousemove', move);
				}
				if (rafId !== null) {
					cancelAnimationFrame(rafId);
					rafId = null;
				}
			};
		}
	});
</script>

<div bind:this={aura} class="cursor-aura" aria-hidden="true"></div>
