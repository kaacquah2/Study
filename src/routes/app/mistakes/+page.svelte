<script lang="ts">
	import MistakeNotebook from '$lib/components/MistakeNotebook.svelte';
	import { page } from '$app/state';

	let moduleId = $derived(page.url.searchParams.get('moduleId') || '');
</script>

<svelte:head>
	<title>Mistake Notebook & Error Bank — Study AI</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<MistakeNotebook {moduleId} />
</div>
