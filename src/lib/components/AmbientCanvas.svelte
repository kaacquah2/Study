<script lang="ts">
	import { onMount } from 'svelte';
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	const width = window.innerWidth;
	const height = window.innerHeight;

	// Simple fluid gradient animation using perlin-like color transition
	const colors = [
		{ r: 100, g: 150, b: 255 },
		{ r: 150, g: 255, b: 200 },
		{ r: 255, g: 200, b: 150 },
		{ r: 255, g: 150, b: 100 }
	];
	let t = 0;
	const speed = 0.0005; // time progression

	function lerp(a: number, b: number, f: number) {
		return a + f * (b - a);
	}

	function draw() {
		if (!ctx) return;
		const gradient = ctx.createLinearGradient(0, 0, width, height);
		const phase = (t % 1) * colors.length;
		const i = Math.floor(phase);
		const f = phase - i;
		const c1 = colors[i % colors.length];
		const c2 = colors[(i + 1) % colors.length];
		const r = Math.floor(lerp(c1.r, c2.r, f));
		const g = Math.floor(lerp(c1.g, c2.g, f));
		const b = Math.floor(lerp(c1.b, c2.b, f));
		gradient.addColorStop(0, `rgb(${r},${g},${b})`);
		gradient.addColorStop(1, `rgb(${r},${g},${b})`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
		t += speed;
		requestAnimationFrame(draw);
	}

	onMount(() => {
		ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		draw();
	});
</script>

<canvas
	bind:this={canvas}
	class="ambient-canvas"
	style="position:fixed; inset:0; z-index:-1; pointer-events:none;"
></canvas>
