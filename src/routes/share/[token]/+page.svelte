<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	interface SharePreview {
		title: string;
		description: string;
		sharedByName: string;
		moduleCount: number;
	}

	const token = $derived(page.params.token);

	// States
	let preview = $state<SharePreview | null>(null);
	let loading = $state(true);
	let claiming = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// Fetch preview info on load
	$effect(() => {
		if (token) {
			fetchPreview();
		}
	});

	const fetchPreview = async () => {
		loading = true;
		errorMsg = '';
		try {
			const { data } = await apiFetch<SharePreview>(`/api/share/${token}`, { skipAuth: true });
			preview = data;
		} catch (e) {
			console.error(e);
			const message = e instanceof Error ? e.message : '';
			errorMsg =
				message || 'Could not load the shared course. It may have been revoked or deleted.';
		} finally {
			loading = false;
		}
	};

	// Claim course handler
	const handleClaim = async () => {
		if (claiming || !token) return;
		claiming = true;
		errorMsg = '';
		successMsg = '';

		try {
			const { data: result } = await apiFetch<{ courseId: string; isSelfClaim?: boolean }>(
				`/api/share/${token}/claim`,
				{ method: 'POST' }
			);

			if (result.isSelfClaim) {
				successMsg = 'This is already your course.';
				setTimeout(() => {
					goto(resolve(`/app/courses/${result.courseId}`)).catch(() => {
						claiming = false;
					});
				}, 1500);
			} else {
				successMsg = 'Course successfully added to your dashboard!';
				setTimeout(() => {
					goto(resolve(`/app/courses/${result.courseId}`)).catch(() => {
						claiming = false;
					});
				}, 1500);
			}
		} catch (e) {
			console.error(e);
			const message = e instanceof Error ? e.message : '';
			errorMsg = message || 'Could not add the course. Please try again.';
			claiming = false;
		}
	};
</script>

<svelte:head>
	<title>Claim Shared Course &mdash; AI Study Buddy</title>
</svelte:head>

<AppShell requireAuth={true}>
	<div class="mx-auto flex w-full max-w-md grow flex-col justify-center px-6 py-12 select-none">
		<!-- Invitation Card -->
		<div
			class="relative flex flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-lg sm:p-10"
		>
			<div class="flex flex-col items-center gap-3 text-center">
				<div
					class="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/5 bg-primary-soft text-primary shadow-sm"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-8 w-8 animate-pulse"
					>
						<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
						<polyline points="16 6 12 2 8 6" />
						<line x1="12" y1="2" x2="12" y2="15" />
					</svg>
				</div>
				<h1
					class="mt-2 font-display text-xl leading-tight font-bold tracking-tight text-text sm:text-2xl"
				>
					Course Invitation
				</h1>
				<p class="text-xs text-text-muted">You have been invited to study this course.</p>
			</div>

			<!-- Errors / Success Feedback -->
			{#if errorMsg}
				<div
					class="rounded-r-md border-l-4 border-danger bg-danger-soft p-3.5 text-xs leading-relaxed font-semibold text-danger"
				>
					{errorMsg}
				</div>
			{/if}

			{#if successMsg}
				<div
					class="rounded-r-md border-l-4 border-success bg-success-soft p-3.5 text-xs leading-relaxed font-semibold text-success"
				>
					{successMsg}
				</div>
			{/if}

			{#if loading}
				<!-- Loading preview shimmers -->
				<div class="flex animate-pulse flex-col gap-3 py-4">
					<div class="h-5 w-3/4 rounded bg-surface-muted"></div>
					<div class="h-3 w-full rounded bg-surface-muted"></div>
					<div class="h-3 w-5/6 rounded bg-surface-muted"></div>
					<div class="mt-2 h-4 w-20 rounded bg-surface-muted"></div>
				</div>
				<div class="h-11 w-full rounded bg-surface-muted"></div>
			{:else if preview && !successMsg}
				<!-- Shared Course Info Preview -->
				<div class="flex flex-col gap-4 rounded-r-md border border-border bg-surface-muted p-5">
					<div>
						<span class="mb-1 block text-[9px] font-bold tracking-widest text-primary uppercase">
							Shared by {preview.sharedByName}
						</span>
						<h2 class="mb-1.5 font-display text-base leading-tight font-bold text-text">
							{preview.title}
						</h2>
						<p class="text-xs leading-relaxed text-text-muted">
							{preview.description}
						</p>
					</div>

					<div
						class="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-text-muted uppercase"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-3.5 w-3.5"
							><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path
								d="M6 6h10"
							/><path d="M6 10h10" /></svg
						>
						{preview.moduleCount} syllabus modules
					</div>
				</div>

				<!-- Claim Action Button -->
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-r-md bg-primary px-4 py-3.5 font-bold text-white shadow-md transition-all duration-180 select-none hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
					onclick={handleClaim}
					disabled={claiming}
				>
					{#if claiming}
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
						></span>
						Adding to your courses...
					{:else}
						Add to my courses
					{/if}
				</button>
			{/if}

			<!-- Decline link -->
			<a
				href={resolve('/app')}
				class="cursor-pointer rounded py-1 text-center text-xs font-semibold text-text-muted select-none hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
			>
				Decline invitation
			</a>
		</div>
	</div>
</AppShell>
