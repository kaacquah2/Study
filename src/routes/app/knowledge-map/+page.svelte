<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth, db } from '$lib/firebase/client';
	import { collection, query, where, getDocs } from 'firebase/firestore';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import KnowledgeMap from '$lib/components/KnowledgeMap.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import type { CourseDoc } from '$lib/firebase/converters';
	import type {
		ConceptNode,
		PrerequisiteEdge,
		RecommendationResult
	} from '$lib/server/knowledgeMap/recommendNext';
	import type { ModuleMastery } from '$lib/server/knowledgeMap/masteryCalculator';

	let courses = $state<CourseDoc[]>([]);
	let selectedCourseId = $state<string>('');
	let loadingCourses = $state(true);
	let loadingMap = $state(false);

	let mapData = $state<{
		graph: { nodes: ConceptNode[]; edges: PrerequisiteEdge[] } | null;
		mastery: Record<string, ModuleMastery>;
		recommendation: RecommendationResult | null;
		isStale?: boolean;
	}>({
		graph: null,
		mastery: {},
		recommendation: null,
		isStale: false
	});

	async function loadUserCourses() {
		if (!authStore.user) return;
		loadingCourses = true;
		try {
			const q = query(collection(db, 'courses'), where('ownerUid', '==', authStore.user.uid));
			const snap = await getDocs(q);
			const fetched = snap.docs.map((doc) => ({
				id: doc.id,
				...doc.data()
			})) as CourseDoc[];

			courses = fetched;

			const urlParams = new URLSearchParams(window.location.search);
			const paramCourseId = urlParams.get('courseId');

			if (paramCourseId && fetched.some((c) => c.id === paramCourseId)) {
				selectedCourseId = paramCourseId;
			} else if (fetched.length > 0) {
				selectedCourseId = fetched[0].id || '';
			}

			if (selectedCourseId) {
				await fetchKnowledgeMap(selectedCourseId);
			}
		} catch (err) {
			console.error('Error fetching user courses:', err);
		} finally {
			loadingCourses = false;
		}
	}

	async function fetchKnowledgeMap(courseId: string) {
		if (!courseId) return;
		loadingMap = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/knowledge-map?courseId=${encodeURIComponent(courseId)}`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});

			if (!res.ok) {
				throw new Error('Failed to load knowledge map');
			}

			const data = await res.json();
			mapData = {
				graph: data.graph || null,
				mastery: data.mastery || {},
				recommendation: data.recommendation || null,
				isStale: Boolean(data.isStale || res.headers.get('X-Knowledge-Map-Stale'))
			};
		} catch (err) {
			console.error('Failed to load map data:', err);
			toastStore.error('Error loading knowledge map for course.');
		} finally {
			loadingMap = false;
		}
	}

	onMount(() => {
		loadUserCourses();
	});

	function handleCourseSelect(e: Event) {
		const newId = (e.target as HTMLSelectElement).value;
		selectedCourseId = newId;

		const newUrl = newId
			? `${window.location.pathname}?courseId=${encodeURIComponent(newId)}`
			: window.location.pathname;
		window.history.replaceState({}, '', newUrl);

		fetchKnowledgeMap(newId);
	}

	let searchQuery = $state('');

	let filteredGraph = $derived.by(() => {
		if (!mapData.graph) return null;
		if (!searchQuery.trim()) return mapData.graph;

		const q = searchQuery.toLowerCase();
		const matchingNodes = mapData.graph.nodes.filter(
			(n) =>
				n.label.toLowerCase().includes(q) ||
				(n.moduleTitle && n.moduleTitle.toLowerCase().includes(q))
		);
		const matchingIds = new Set(matchingNodes.map((n) => n.id));
		const matchingEdges = mapData.graph.edges.filter(
			(e) => matchingIds.has(e.source) && matchingIds.has(e.target)
		);

		return { nodes: matchingNodes, edges: matchingEdges };
	});

	function handleNodeAction(node: ConceptNode, actionType: 'lesson' | 'quiz' | 'review') {
		if (actionType === 'review') {
			goto(
				`/app/review?courseId=${encodeURIComponent(selectedCourseId)}&moduleId=${encodeURIComponent(node.moduleId)}`
			);
		} else if (node.moduleId) {
			goto(
				`/app/courses/${encodeURIComponent(selectedCourseId)}/${encodeURIComponent(node.moduleId)}`
			);
		} else {
			goto(`/app/courses/${encodeURIComponent(selectedCourseId)}`);
		}
	}

	async function handleFlagEdge(source: string, target: string) {
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/knowledge-map', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'flag',
					courseId: selectedCourseId,
					source,
					target
				})
			});
			if (res.ok) {
				toastStore.success('Prerequisite edge flagged and hidden.');
				await fetchKnowledgeMap(selectedCourseId);
			} else {
				toastStore.error('Failed to flag edge.');
			}
		} catch (err) {
			console.error('Edge flagging error:', err);
			toastStore.error('Error flagging edge.');
		}
	}
</script>

<svelte:head>
	<title>Knowledge Map &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 py-4">
	<!-- Header Bar -->
	<div
		class="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<a
				href={resolve('/app')}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">🧠 AI Knowledge Map</h1>
			<p class="mt-0.5 text-xs text-text-muted">
				Adaptive visual prerequisite graph connecting course concepts with FSRS memory scheduling.
			</p>
		</div>

		<!-- Course Selector Dropdown & Search -->
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search concept..."
				class="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
			/>
			{#if loadingCourses}
				<div class="h-10 w-48 animate-pulse rounded-xl bg-surface-muted"></div>
			{:else if courses.length > 0}
				<select
					value={selectedCourseId}
					onchange={handleCourseSelect}
					class="w-full cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-text shadow-xs focus:border-primary focus:outline-none sm:w-64"
				>
					{#each courses as course (course.id)}
						<option value={course.id}>📚 {course.title}</option>
					{/each}
				</select>
			{/if}
		</div>
	</div>

	{#if loadingMap}
		<div class="flex flex-col gap-4">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else}
		<KnowledgeMap
			graph={filteredGraph}
			mastery={mapData.mastery}
			recommendation={mapData.recommendation}
			isStale={mapData.isStale}
			onNodeAction={handleNodeAction}
			onFlagEdge={handleFlagEdge}
		/>
	{/if}
</div>
