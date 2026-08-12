<script lang="ts">
	import SharedCourseCard from '$lib/components/SharedCourseCard.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { db, auth } from '$lib/firebase/client';
	import { collection, query, where, getDocs } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { SharedCourseDoc } from '$lib/firebase/converters';

	let sharedCourses = $state<SharedCourseDoc[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');
	let selectedTag = $state('All');
	let importingShareId = $state<string | null>(null);

	const availableTags = ['All', 'AI', 'Programming', 'Science', 'History', 'Math'];

	$effect(() => {
		fetchSharedCourses();
	});

	const fetchSharedCourses = async () => {
		loading = true;
		loadError = '';
		try {
			const q = query(collection(db, 'sharedCourses'), where('revoked', '==', false));
			const snap = await getDocs(q);
			const fetched = snap.docs.map((doc) => ({
				id: doc.id,
				...doc.data()
			})) as SharedCourseDoc[];

			sharedCourses = fetched;
		} catch (err) {
			console.error('Fetch shared courses error:', err);
			loadError = 'Failed to load community shared courses.';
		} finally {
			loading = false;
		}
	};

	let sortBy = $state<'popular' | 'beginner'>('popular');

	let filteredCourses = $derived.by(() => {
		let list = sharedCourses;

		if (selectedTag !== 'All') {
			list = list.filter((c) =>
				(c.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())
			);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(c) =>
					c.snapshot.title.toLowerCase().includes(q) ||
					c.snapshot.description.toLowerCase().includes(q) ||
					c.sharedByName.toLowerCase().includes(q)
			);
		}

		// Pin isOfficial courses first, then sort by popularity / level
		return [...list].sort((a, b) => {
			if (a.isOfficial && !b.isOfficial) return -1;
			if (!a.isOfficial && b.isOfficial) return 1;
			if (sortBy === 'beginner') {
				if (a.level === 'beginner' && b.level !== 'beginner') return -1;
				if (a.level !== 'beginner' && b.level === 'beginner') return 1;
			}
			const impA = a.importCount || a.claimCount || 0;
			const impB = b.importCount || b.claimCount || 0;
			return impB - impA;
		});
	});

	const handleImportCourse = async (shareId: string) => {
		if (importingShareId) return;
		importingShareId = shareId;

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

			toastStore.success('Course imported successfully!');
			goto(`/app/courses/${data.courseId}`);
		} catch (err) {
			console.error('Import course error:', err);
			toastStore.error('Failed to import course');
		} finally {
			importingShareId = null;
		}
	};
</script>

<svelte:head>
	<title>Explore Courses &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex w-full flex-col gap-8">
	<!-- Page Header -->
	<div>
		<h1 class="font-display text-2xl font-bold text-text sm:text-3xl">Explore Community Courses</h1>
		<p class="mt-1 text-xs text-text-muted sm:text-sm">
			Browse and import courses created and shared by learners around the world.
		</p>
	</div>

	<!-- Search & Tag Filter Bar -->
	<div class="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
		<!-- Search Input & Sort Dropdown -->
		<div class="flex max-w-xl grow flex-col gap-2.5 sm:flex-row sm:items-center">
			<div class="relative grow">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-text-muted"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search title, description, or author..."
					class="w-full rounded-2xl border border-border bg-surface py-2.5 pr-4 pl-10 text-xs font-medium text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
				/>
			</div>

			<select
				bind:value={sortBy}
				class="cursor-pointer rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text shadow-xs focus:border-primary focus:outline-none"
			>
				<option value="popular">🔥 Most Popular</option>
				<option value="beginner">🌱 Beginner Friendly</option>
			</select>
		</div>

		<!-- Tag Filter Chips -->
		<div class="flex flex-wrap items-center gap-1.5">
			{#each availableTags as tag (tag)}
				<button
					type="button"
					onclick={() => (selectedTag = tag)}
					class="cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition-all {selectedTag ===
					tag
						? 'border-primary bg-primary text-white shadow-xs'
						: 'border-border bg-surface text-text-muted hover:border-border/80'}"
				>
					{tag}
				</button>
			{/each}
		</div>
	</div>

	<!-- Course Grid -->
	{#if loading}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if loadError}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{loadError}
		</div>
	{:else if filteredCourses.length === 0}
		<EmptyState
			title="No community courses found"
			description={searchQuery
				? 'Try clearing your search filters to view available shared courses.'
				: 'Be the first to share a course with the community!'}
			actionLabel={searchQuery ? 'Clear Search' : '+ Create New Course'}
			onAction={() => {
				if (searchQuery) {
					searchQuery = '';
					selectedTag = 'All';
				} else {
					goto('/app/courses/createCourse');
				}
			}}
		/>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredCourses as item (item.id)}
				<SharedCourseCard
					shareId={item.id || ''}
					title={item.snapshot.title}
					description={item.snapshot.description}
					sharedByName={item.sharedByName}
					importCount={item.claimCount || item.importCount || 0}
					isOfficial={item.isOfficial}
					level={item.level || 'intermediate'}
					tags={item.tags || []}
					moduleCount={item.snapshot.modules.length}
					onImport={handleImportCourse}
					loading={importingShareId === item.id}
				/>
			{/each}
		</div>
	{/if}
</div>
