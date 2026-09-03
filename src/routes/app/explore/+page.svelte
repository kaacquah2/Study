<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import SharedCourseCard from '$lib/components/SharedCourseCard.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { db } from '$lib/firebase/client';
	import { apiFetch } from '$lib/api/client';
	import { collection, query, where, getDocs, limit as firestoreLimit } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { SharedCourseDoc } from '$lib/firebase/converters';

	interface ExploreCourseItem {
		id: string;
		title: string;
		description: string;
		sharedByName: string;
		moduleCount: number;
		claimCount: number;
		importCount: number;
		isOfficial: boolean;
		level: 'beginner' | 'intermediate' | 'advanced';
		tags: string[];
		createdAt?: string | null;
	}

	let courses = $state<ExploreCourseItem[]>([]);
	let availableTags = $state<string[]>(['All']);
	let loading = $state(true);
	let loadingMore = $state(false);
	let loadError = $state('');
	let searchQuery = $state('');
	let selectedTag = $state('All');
	let sortBy = $state<'popular' | 'beginner' | 'newest'>('popular');
	let nextCursor = $state<string | null>(null);
	let hasMore = $state(false);
	let importingShareId = $state<string | null>(null);

	$effect(() => {
		// Re-fetch when sorting or tags or search query changes
		fetchSharedCourses();
	});

	const fetchSharedCourses = async (loadNext = false) => {
		if (loadNext) {
			if (loadingMore || !nextCursor) return;
			loadingMore = true;
		} else {
			loading = true;
			loadError = '';
		}

		try {
			const params = new SvelteURLSearchParams({
				sort: sortBy,
				limit: '18'
			});
			if (searchQuery.trim()) params.set('search', searchQuery.trim());
			if (selectedTag !== 'All') params.set('tag', selectedTag);
			if (loadNext && nextCursor) params.set('cursor', nextCursor);

			const { data } = await apiFetch<{
				courses?: ExploreCourseItem[];
				availableTags?: string[];
				hasMore?: boolean;
				nextCursor?: string | null;
			}>(`/api/explore?${params.toString()}`);

			if (loadNext) {
				courses = [...courses, ...(data.courses || [])];
			} else {
				courses = data.courses || [];
				if (Array.isArray(data.availableTags) && data.availableTags.length > 0) {
					availableTags = data.availableTags;
				}
			}
			hasMore = Boolean(data.hasMore);
			nextCursor = data.nextCursor || null;
		} catch (err) {
			console.error('Fetch shared courses error:', err);
			// Fallback to direct client query enforcing isPublic == true and revoked == false
			try {
				const q = query(
					collection(db, 'sharedCourses'),
					where('isPublic', '==', true),
					where('revoked', '==', false),
					firestoreLimit(30)
				);
				const snap = await getDocs(q);
				const fetched = snap.docs.map((d) => {
					const docData = d.data() as SharedCourseDoc;
					const snapContent = docData.snapshot || { title: '', description: '', modules: [] };
					return {
						id: d.id,
						title: snapContent.title,
						description: snapContent.description,
						sharedByName: docData.sharedByName || 'Community Member',
						moduleCount: Array.isArray(snapContent.modules) ? snapContent.modules.length : 0,
						claimCount: docData.claimCount || 0,
						importCount: docData.importCount || docData.claimCount || 0,
						isOfficial: Boolean(docData.isOfficial),
						level: docData.level || 'intermediate',
						tags: docData.tags || []
					};
				});

				courses = fetched;
				hasMore = false;
				nextCursor = null;
			} catch (fallbackErr) {
				console.error('Explore fallback query error:', fallbackErr);
				loadError = 'Failed to load community shared courses.';
			}
		} finally {
			loading = false;
			loadingMore = false;
		}
	};

	let filteredCourses = $derived.by(() => {
		// Client side filtering & sorting to ensure instantaneous responsiveness on text input
		let list = courses;

		if (selectedTag !== 'All') {
			list = list.filter((c) =>
				(c.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())
			);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(
				(c) =>
					(c.title || '').toLowerCase().includes(q) ||
					(c.description || '').toLowerCase().includes(q) ||
					(c.sharedByName || '').toLowerCase().includes(q) ||
					(Array.isArray(c.tags) ? c.tags : []).some((t) => (t || '').toLowerCase().includes(q))
			);
		}

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
			const { data } = await apiFetch<{ courseId: string }>(`/api/share/${shareId}/claim`, {
				method: 'POST'
			});

			toastStore.success('Course imported successfully!');
			goto(`/app/courses/${data.courseId}`);
		} catch (err) {
			console.error('Import course error:', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to import course');
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
			Browse and import courses published by learners around the world.
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
				<option value="newest">✨ Newest</option>
			</select>
		</div>

		<!-- Tag Filter Chips -->
		{#if availableTags.length > 1}
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
		{/if}
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
				? 'Try clearing your search filters to view available community courses.'
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
					shareId={item.id}
					title={item.title}
					description={item.description}
					sharedByName={item.sharedByName}
					importCount={item.importCount || item.claimCount || 0}
					isOfficial={item.isOfficial}
					level={item.level || 'intermediate'}
					tags={item.tags || []}
					moduleCount={item.moduleCount}
					onImport={handleImportCourse}
					loading={importingShareId === item.id}
				/>
			{/each}
		</div>

		{#if hasMore}
			<div class="mt-4 flex justify-center">
				<button
					type="button"
					onclick={() => fetchSharedCourses(true)}
					disabled={loadingMore}
					class="cursor-pointer rounded-xl border border-border bg-surface px-6 py-2.5 text-xs font-bold text-text transition-all hover:bg-surface-muted disabled:opacity-50"
				>
					{loadingMore ? 'Loading more...' : 'Load More Courses'}
				</button>
			</div>
		{/if}
	{/if}
</div>
