<script lang="ts">
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, getDoc } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { SharedCourseDoc } from '$lib/firebase/converters';

	const shareId = $derived(page.params.shareId);

	let sharedCourse = $state<SharedCourseDoc | null>(null);
	let loading = $state(true);
	let loadError = $state('');
	let actionLoading = $state(false);

	$effect(() => {
		if (shareId) {
			loadShare();
		}
	});

	const loadShare = async () => {
		loading = true;
		loadError = '';
		try {
			const shareSnap = await getDoc(doc(db, 'sharedCourses', shareId as string));
			if (shareSnap.exists()) {
				sharedCourse = { id: shareSnap.id, ...shareSnap.data() } as SharedCourseDoc;
			} else {
				loadError = 'Shared course not found or link has expired.';
			}
		} catch (err) {
			console.error('Error fetching share link:', err);
			loadError = 'Failed to load shared course details.';
		} finally {
			loading = false;
		}
	};

	const handleImportCTA = async () => {
		if (!authStore.user) {
			// Prompt login/signup
			goto(resolve(`/?redirect=${encodeURIComponent(`/shared/${shareId}`)}`));
			return;
		}

		if (actionLoading) return;
		actionLoading = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/share/${shareId}/claim`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Failed to import course');
			}

			toastStore.success('Course imported to your dashboard!');
			goto(resolve(`/app/courses/${data.courseId}`));
		} catch (err) {
			console.error('Import error:', err);
			toastStore.error('Could not import course');
		} finally {
			actionLoading = false;
		}
	};
</script>

<svelte:head>
	<title>{sharedCourse?.snapshot.title || 'Shared Course'} &mdash; AI Study Buddy</title>
</svelte:head>

<div class="p-6 sm:p-12 flex min-h-screen flex-col justify-between bg-bg text-text">
	<!-- Top Navigation -->
	<header class="max-w-4xl mx-auto flex w-full items-center justify-between">
		<a href={resolve('/')} class="gap-2.5 font-display text-lg font-bold flex items-center">
			<div class="h-8 w-8 text-white flex items-center justify-center rounded-lg bg-primary">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					class="h-4 w-4"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
				</svg>
			</div>
			<span>AI Study Buddy</span>
		</a>

		{#if authStore.user}
			<a
				href={resolve('/app')}
				class="px-4 py-2 text-xs font-bold rounded-xl bg-primary-soft text-primary hover:bg-primary/20"
			>
				Go to Dashboard &rarr;
			</a>
		{:else}
			<a
				href={resolve('/')}
				class="px-4 py-2 text-xs font-bold text-white shadow-xs rounded-xl bg-primary hover:bg-primary-hover"
			>
				Sign In / Register
			</a>
		{/if}
	</header>

	<!-- Main Preview Container -->
	<main class="max-w-3xl gap-6 py-8 mx-auto my-auto flex w-full flex-col">
		{#if loading}
			<Skeleton variant="card" height="h-64" />
		{:else if loadError || !sharedCourse}
			<div
				class="rounded-2xl p-8 text-xs font-bold border border-danger/20 bg-danger-soft text-center text-danger"
			>
				{loadError || 'Shared course link not found.'}
			</div>
		{:else}
			<div class="gap-6 rounded-3xl p-8 shadow-xl flex flex-col border border-border bg-surface">
				<!-- Badges -->
				<div class="gap-2 flex flex-wrap items-center">
					<span
						class="px-2.5 py-1 font-bold rounded-lg border border-primary/20 bg-primary-soft text-[10px] text-primary uppercase"
					>
						{sharedCourse.level || 'Intermediate'}
					</span>
					<span
						class="px-2.5 py-1 font-bold rounded-lg border border-border/40 bg-surface-muted text-[10px] text-text-muted"
					>
						Shared by {sharedCourse.sharedByName}
					</span>
				</div>

				<div>
					<h1 class="font-display text-2xl font-bold sm:text-3xl text-text">
						{sharedCourse.snapshot.title}
					</h1>
					<p class="mt-2 text-xs leading-relaxed sm:text-sm text-text-muted">
						{sharedCourse.snapshot.description}
					</p>
				</div>

				<!-- Module Titles Preview List -->
				<div class="gap-2 pt-4 flex flex-col border-t border-border/40">
					<h3 class="font-display text-xs font-bold tracking-wider text-text uppercase">
						Course Modules ({sharedCourse.snapshot.modules.length})
					</h3>
					<div class="gap-2 flex flex-col">
						{#each sharedCourse.snapshot.modules as mod, idx (mod.title || idx)}
							<div
								class="gap-3 p-3 text-xs flex items-center rounded-xl border border-border/60 bg-surface-muted/40"
							>
								<span
									class="h-6 w-6 font-bold flex items-center justify-center rounded-lg bg-primary-soft text-[10px] text-primary"
								>
									{idx + 1}
								</span>
								<span class="font-semibold text-text">{mod.title}</span>
								<span
									class="rounded px-2 py-0.5 font-bold ml-auto bg-surface text-[9px] text-text-muted uppercase"
								>
									{mod.type}
								</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Import CTA Button -->
				<div class="gap-2 pt-4 flex flex-col">
					<button
						type="button"
						onclick={handleImportCTA}
						disabled={actionLoading}
						class="py-4 font-bold text-white w-full cursor-pointer rounded-xl bg-primary shadow-lg shadow-primary/20 hover:bg-primary-hover active:scale-99 disabled:opacity-50"
					>
						{#if actionLoading}
							Importing course...
						{:else if !authStore.user}
							Sign In to Import Course
						{:else}
							Import this Course to My Dashboard
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</main>

	<!-- Footer -->
	<footer class="text-xs font-semibold mx-auto text-center text-text-muted">
		&copy; 2026 AI Study Buddy &bull; Smart Learning Companion
	</footer>

	<Toast />
</div>
