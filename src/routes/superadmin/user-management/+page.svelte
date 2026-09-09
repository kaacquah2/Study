<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	$effect(() => {
		goto(resolve('/app/admin?tab=users' as '/app'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>User & Access Governance &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
	<div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
	<p class="text-xs text-text-muted">Redirecting to unified User & Role Governance...</p>
</div>
