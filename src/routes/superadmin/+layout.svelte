<script lang="ts">
	import type { Snippet } from 'svelte';
	import Toast from '$lib/components/Toast.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="min-h-screen bg-bg text-text">
	{@render children()}
</div>

<Toast />
