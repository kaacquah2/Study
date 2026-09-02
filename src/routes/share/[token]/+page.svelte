<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import { page } from '$app/state';
	import { auth } from '$lib/firebase/client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/theme.svelte';

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
			const res = await fetch(`/api/share/${token}`);
			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error?.message || 'Failed to fetch course details');
			}
			preview = result;
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
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/share/${token}/claim`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					'X-Client-Theme': themeStore.current,
					'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
				}
			});

			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error?.message || 'Failed to add course');
			}

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
	<div class="max-w-md px-6 py-12 mx-auto flex w-full grow flex-col justify-center select-none">
		<!-- Invitation Card -->
		<div
			class="gap-6 p-6 sm:p-10 relative flex flex-col rounded-lg border border-border bg-surface shadow-lg"
		>
			<div class="gap-3 flex flex-col items-center text-center">
				<div
					class="h-16 w-16 rounded-2xl flex items-center justify-center border border-primary/5 bg-primary-soft text-primary shadow-sm"
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
					class="mt-2 font-display text-xl leading-tight font-bold tracking-tight sm:text-2xl text-text"
				>
					Course Invitation
				</h1>
				<p class="text-xs text-text-muted">You have been invited to study this course.</p>
			</div>

			<!-- Errors / Success Feedback -->
			{#if errorMsg}
				<div
					class="p-3.5 text-xs leading-relaxed font-semibold rounded-r-md border-l-4 border-danger bg-danger-soft text-danger"
				>
					{errorMsg}
				</div>
			{/if}

			{#if successMsg}
				<div
					class="p-3.5 text-xs leading-relaxed font-semibold rounded-r-md border-l-4 border-success bg-success-soft text-success"
				>
					{successMsg}
				</div>
			{/if}

			{#if loading}
				<!-- Loading preview shimmers -->
				<div class="animate-pulse gap-3 py-4 flex flex-col">
					<div class="h-5 rounded w-3/4 bg-surface-muted"></div>
					<div class="h-3 rounded w-full bg-surface-muted"></div>
					<div class="h-3 rounded w-5/6 bg-surface-muted"></div>
					<div class="mt-2 h-4 w-20 rounded bg-surface-muted"></div>
				</div>
				<div class="h-11 rounded w-full bg-surface-muted"></div>
			{:else if preview && !successMsg}
				<!-- Shared Course Info Preview -->
				<div class="gap-4 p-5 flex flex-col rounded-r-md border border-border bg-surface-muted">
					<div>
						<span class="mb-1 font-bold tracking-widest block text-[9px] text-primary uppercase">
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
						class="gap-1.5 font-bold tracking-wider flex items-center text-[10px] text-text-muted uppercase"
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
					class="gap-2 px-4 py-3.5 font-bold text-white flex w-full cursor-pointer items-center justify-center rounded-r-md bg-primary shadow-md transition-all duration-180 select-none hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
					onclick={handleClaim}
					disabled={claiming}
				>
					{#if claiming}
						<span
							class="h-4 w-4 animate-spin border-white rounded-full border-2 border-t-transparent"
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
				class="rounded py-1 text-xs font-semibold cursor-pointer text-center text-text-muted select-none hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
			>
				Decline invitation
			</a>
		</div>
	</div>
</AppShell>
