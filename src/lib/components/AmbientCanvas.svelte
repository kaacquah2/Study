<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let width = 0;
	let height = 0;
	let timerId: ReturnType<typeof setTimeout> | null = null;

	// Fluid ambient colors derived from primary & accent design tokens
	const colors = [
		{ r: 107, g: 92, b: 246 }, // --primary #6b5cf6
		{ r: 124, g: 58, b: 237 }, // --c-violet #7c3aed
		{ r: 232, g: 148, b: 12 }, // --accent #e8940c
		{ r: 90, g: 76, b: 224 } // --primary-hover #5a4ce0
	];
	let t = 0;
	// Scaled for ~10fps tick interval (100ms)
	const speed = 0.003;

	function lerp(a: number, b: number, f: number) {
		return a + f * (b - a);
	}

	function resize() {
		if (!browser || !canvas) return;
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;
	}

	function stopLoop() {
		if (timerId !== null) {
			clearTimeout(timerId);
			timerId = null;
		}
	}

	function draw(loop = true) {
		if (!ctx || width === 0 || height === 0) return;
		if (browser && document.hidden) {
			stopLoop();
			return;
		}

		const gradient = ctx.createLinearGradient(0, 0, width, height);
		const phase = (t % 1) * colors.length;
		const i = Math.floor(phase);
		const f = phase - i;
		const c1 = colors[i % colors.length];
		const c2 = colors[(i + 1) % colors.length];
		const c3 = colors[(i + 2) % colors.length];

		const r1 = Math.floor(lerp(c1.r, c2.r, f));
		const g1 = Math.floor(lerp(c1.g, c2.g, f));
		const b1 = Math.floor(lerp(c1.b, c2.b, f));

		const r2 = Math.floor(lerp(c2.r, c3.r, f));
		const g2 = Math.floor(lerp(c2.g, c3.g, f));
		const b2 = Math.floor(lerp(c2.b, c3.b, f));

		gradient.addColorStop(0, `rgb(${r1},${g1},${b1})`);
		gradient.addColorStop(1, `rgb(${r2},${g2},${b2})`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);

		if (loop) {
			t += speed;
			stopLoop();
			timerId = setTimeout(() => draw(true), 100);
		}
	}

	onMount(() => {
		if (browser && canvas) {
			const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			resize();
			ctx = canvas.getContext('2d');

			const startOrStop = () => {
				stopLoop();
				if (document.hidden) return;

				if (motionMediaQuery.matches) {
					draw(false);
				} else {
					draw(true);
				}
			};

			const handleResize = () => {
				resize();
				if (motionMediaQuery.matches) {
					draw(false);
				}
			};

			const handleVisibilityChange = () => {
				if (document.hidden) {
					stopLoop();
				} else {
					startOrStop();
				}
			};

			startOrStop();
			motionMediaQuery.addEventListener('change', startOrStop);
			window.addEventListener('resize', handleResize);
			document.addEventListener('visibilitychange', handleVisibilityChange);

			return () => {
				stopLoop();
				motionMediaQuery.removeEventListener('change', startOrStop);
				window.removeEventListener('resize', handleResize);
				document.removeEventListener('visibilitychange', handleVisibilityChange);
			};
		}
	});
</script>

<canvas
	bind:this={canvas}
	class="ambient-canvas"
	style="position:fixed; inset:0; z-index:-1; pointer-events:none;"
></canvas>
