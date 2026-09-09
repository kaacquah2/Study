<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	$effect(() => {
		const uid = page.params.uid;
		const target = uid
			? `/app/admin?tab=users&inspect=${encodeURIComponent(uid)}`
			: '/app/admin?tab=users';
		goto(resolve(target as '/app'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>User Dossier &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
	<div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
	<p class="text-xs text-text-muted">Redirecting to user dossier in Admin Console...</p>
</div>
