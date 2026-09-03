<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.mid);

	$effect(() => {
		if (courseId && moduleId) {
			const search = page.url.search || '';
			goto(resolve(`/app/courses/${courseId}/${moduleId}${search}`), { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Redirecting to Quiz &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-bg text-text">
	<div class="flex flex-col items-center gap-4 p-6 text-center">
		<div
			class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"
		></div>
		<p class="text-sm font-medium text-text-muted">Redirecting to quiz runner...</p>
	</div>
</div>
