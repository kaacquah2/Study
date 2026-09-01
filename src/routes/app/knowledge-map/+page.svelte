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
	import EmptyState from '$lib/components/EmptyState.svelte';
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

<div class="max-w-5xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Header Bar -->
	<div
		class="gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between flex flex-col border-b border-border"
	>
		<div>
			<a
				href={resolve('/app')}
				class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">🧠 AI Knowledge Map</h1>
			<p class="mt-0.5 text-xs text-text-muted">
				Adaptive visual prerequisite graph connecting course concepts with FSRS memory scheduling.
			</p>
		</div>

		<!-- Course Selector Dropdown & Search -->
		<div class="gap-2 sm:flex-row sm:items-center flex flex-col">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search concept..."
				class="px-3 py-2 text-xs font-medium rounded-xl border border-border bg-surface text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
			/>
			{#if loadingCourses}
				<div class="h-10 w-48 animate-pulse rounded-xl bg-surface-muted"></div>
			{:else if courses.length > 0}
				<select
					value={selectedCourseId}
					onchange={handleCourseSelect}
					class="px-4 py-2 text-xs font-bold shadow-xs sm:w-64 w-full cursor-pointer rounded-xl border border-border bg-surface text-text focus:border-primary focus:outline-none"
				>
					{#each courses as course (course.id)}
						<option value={course.id}>📚 {course.title}</option>
					{/each}
				</select>
			{/if}
		</div>
	</div>

	<!-- Mastery Color Legend Bar -->
	<div
		class="gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-2xs flex flex-wrap items-center justify-between border border-border bg-surface text-text-muted"
	>
		<div class="gap-2 font-bold flex items-center text-text">
			<span>🎨 Mastery Legend:</span>
		</div>
		<div class="gap-4 flex flex-wrap items-center">
			<span class="gap-1.5 flex items-center">
				<span class="h-2.5 w-2.5 bg-emerald-500 rounded-full"></span>
				<strong class="text-text">Mastered</strong> (≥80%)
			</span>
			<span class="gap-1.5 flex items-center">
				<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
				<strong class="text-text">Reviewing</strong> (40–79%)
			</span>
			<span class="gap-1.5 flex items-center">
				<span class="h-2.5 w-2.5 bg-amber-500 rounded-full"></span>
				<strong class="text-text">Learning</strong> (1–39%)
			</span>
			<span class="gap-1.5 flex items-center">
				<span class="h-2.5 w-2.5 bg-slate-400 rounded-full"></span>
				<strong class="text-text">Not Assessed</strong>
			</span>
		</div>
	</div>

	<!-- AI Recommended Next Step Banner (if available from recommendNext.ts) -->
	{#if mapData.recommendation}
		<div
			class="gap-4 rounded-3xl p-5 shadow-xs sm:flex-row sm:items-center flex flex-col justify-between border border-primary/30 bg-linear-to-r from-primary-soft/40 via-surface to-surface"
		>
			<div class="gap-3.5 flex items-center">
				<div
					class="h-11 w-11 rounded-2xl text-xl text-white flex shrink-0 items-center justify-center bg-primary shadow-md shadow-primary/20"
				>
					🎯
				</div>
				<div>
					<div class="gap-2 flex items-center">
						<span
							class="px-2 py-0.5 font-black tracking-wider rounded-full bg-primary/10 text-[10px] text-primary uppercase"
						>
							AI Recommended Next Topic
						</span>
					</div>
					<h3 class="font-display text-base font-bold text-text">
						{mapData.recommendation.node.label}
						{#if mapData.recommendation.node.moduleTitle}
							<span class="text-xs font-normal text-text-muted">
								({mapData.recommendation.node.moduleTitle})
							</span>
						{/if}
					</h3>
					<p class="mt-0.5 text-xs text-text-muted">
						{mapData.recommendation.reason}
					</p>
				</div>
			</div>

			<div class="gap-2 flex shrink-0 items-center">
				<button
					type="button"
					onclick={() =>
						mapData.recommendation && handleNodeAction(mapData.recommendation.node, 'lesson')}
					class="gap-1.5 px-4 py-2.5 text-xs font-bold text-white shadow-xs inline-flex cursor-pointer items-center rounded-xl bg-primary transition-all hover:bg-primary-hover active:scale-95"
				>
					<span>Study Topic &rarr;</span>
				</button>
			</div>
		</div>
	{/if}

	{#if loadingMap || loadingCourses}
		<div class="gap-4 flex flex-col">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if courses.length === 0}
		<EmptyState
			title="No Knowledge Maps Available Yet"
			description="Create your first AI-generated course or import shared modules to visualize your concept dependency graph."
			actionLabel="+ Create First Course"
			onAction={() => goto('/app/courses/createCourse')}
			secondaryActionLabel="or explore public courses"
			secondaryActionHref="/app/explore"
		/>
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
