<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
	import { chatStore } from '$lib/stores/chat.svelte';
	import type {
		ConceptNode,
		PrerequisiteEdge,
		RecommendationResult
	} from '$lib/server/knowledgeMap/recommendNext';
	import type { ModuleMastery } from '$lib/server/knowledgeMap/masteryCalculator';

	interface Props {
		graph: { nodes: ConceptNode[]; edges: PrerequisiteEdge[] } | null;
		mastery: Record<string, ModuleMastery>;
		recommendation: RecommendationResult | null;
		isStale?: boolean;
		onNodeAction?: (node: ConceptNode, actionType: 'lesson' | 'quiz' | 'review') => void;
		onFlagEdge?: (source: string, target: string) => Promise<void>;
	}

	let {
		graph,
		mastery = {},
		recommendation = null,
		isStale = false,
		onNodeAction,
		onFlagEdge
	}: Props = $props();

	// Layout State
	let elkLayout = $state<ElkNode | null>(null);
	let layoutLoading = $state(true);
	let selectedNode = $state<ConceptNode | null>(null);
	let collapsedModules = new SvelteSet<string>();
	let viewMode = $state<'canvas' | 'tree'>('canvas');
	let searchQuery = $state('');

	// Pan & Zoom Controls
	let zoomLevel = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isDragging = $state(false);
	let dragStartX = $state(0);
	let dragStartY = $state(0);

	// Group nodes by module
	let moduleGroups = $derived.by(() => {
		if (!graph || !graph.nodes) return [];
		const groups: Record<
			string,
			{ moduleId: string; title: string; nodes: ConceptNode[]; mastery: ModuleMastery }
		> = {};

		for (const node of graph.nodes) {
			const modId = node.moduleId || 'default';
			const modTitle = node.moduleTitle || 'Module';
			const modMastery = mastery[modId] || {
				moduleId: modId,
				masteryPercent: -1,
				questionsTotal: 0,
				questionsReviewed: 0,
				questionsDue: 0,
				averageStability: 0,
				fsrsState: 'not-assessed'
			};

			if (!groups[modId]) {
				groups[modId] = {
					moduleId: modId,
					title: modTitle,
					nodes: [],
					mastery: modMastery
				};
			}
			groups[modId].nodes.push(node);
		}
		return Object.values(groups);
	});

	// Filtered groups by search query
	let filteredModuleGroups = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return moduleGroups;
		return moduleGroups
			.map((g) => ({
				...g,
				nodes: g.nodes.filter(
					(n) =>
						n.label.toLowerCase().includes(q) ||
						n.id.toLowerCase().includes(q) ||
						g.title.toLowerCase().includes(q)
				)
			}))
			.filter((g) => g.nodes.length > 0 || g.title.toLowerCase().includes(q));
	});

	async function computeElkLayout() {
		if (!graph || !graph.nodes || graph.nodes.length === 0) {
			layoutLoading = false;
			return;
		}

		layoutLoading = true;
		try {
			const elk = new ELK();

			// Group nodes by module for ELK compound graph
			const clustersMap: Record<string, ElkNode[]> = {};
			for (const node of graph.nodes) {
				const modId = node.moduleId || 'default';
				if (!clustersMap[modId]) clustersMap[modId] = [];

				clustersMap[modId].push({
					id: node.id,
					width: 170,
					height: 54,
					labels: [{ text: node.label }]
				});
			}

			const elkChildren: ElkNode[] = [];
			for (const [modId, childNodes] of Object.entries(clustersMap)) {
				const modTitle = moduleGroups.find((g) => g.moduleId === modId)?.title || 'Module';
				const isCollapsed = collapsedModules.has(modId);

				if (isCollapsed) {
					elkChildren.push({
						id: `cluster-${modId}`,
						width: 190,
						height: 54,
						labels: [{ text: `📦 ${modTitle} (Collapsed)` }],
						children: []
					});
				} else {
					elkChildren.push({
						id: `cluster-${modId}`,
						children: childNodes,
						layoutOptions: {
							'elk.padding': '[top=35,left=15,bottom=15,right=15]',
							'elk.spacing.nodeNode': '20'
						}
					});
				}
			}

			const elkEdges = (graph.edges || []).map((e, idx) => ({
				id: `e-${idx}`,
				sources: [e.source],
				targets: [e.target]
			}));

			const result = await elk.layout({
				id: 'root',
				layoutOptions: {
					'elk.algorithm': 'layered',
					'elk.direction': 'RIGHT',
					'elk.spacing.nodeNode': '30',
					'elk.layered.spacing.nodeNodeBetweenLayers': '45',
					'elk.padding': '[top=25,left=25,bottom=25,right=25]'
				},
				children: elkChildren,
				edges: elkEdges
			});

			elkLayout = result;
		} catch (err) {
			console.error('ELK Layout error:', err);
		} finally {
			layoutLoading = false;
		}
	}

	$effect(() => {
		if (graph && graph.nodes) {
			computeElkLayout();
		}
	});

	function toggleModuleCollapse(modId: string) {
		if (collapsedModules.has(modId)) {
			collapsedModules.delete(modId);
		} else {
			collapsedModules.add(modId);
		}
		computeElkLayout();
	}

	function handleZoom(delta: number) {
		zoomLevel = Math.max(0.4, Math.min(2.5, zoomLevel + delta));
	}

	function handleResetView() {
		zoomLevel = 1;
		panX = 0;
		panY = 0;
	}

	function handleWheel(e: WheelEvent) {
		if (viewMode !== 'canvas') return;
		e.preventDefault();
		const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
		handleZoom(zoomDelta);
	}

	function handleMouseDown(e: MouseEvent) {
		if (viewMode !== 'canvas') return;
		isDragging = true;
		dragStartX = e.clientX - panX;
		dragStartY = e.clientY - panY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		panX = e.clientX - dragStartX;
		panY = e.clientY - dragStartY;
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function getNodeMasteryColor(modId: string) {
		const m = mastery[modId];
		if (!m || m.masteryPercent < 0) {
			return { bg: '#1e293b', border: '#475569', text: '#94a3b8', label: 'Not Assessed' };
		}
		if (m.masteryPercent >= 80) {
			return { bg: '#064e3b', border: '#10b981', text: '#6ee7b7', label: 'Mastered' };
		}
		if (m.masteryPercent >= 50) {
			return { bg: '#78350f', border: '#f59e0b', text: '#fcd34d', label: 'Learning' };
		}
		return { bg: '#881337', border: '#f43f5e', text: '#fda4af', label: 'Needs Practice' };
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && selectedNode) {
			selectedNode = null;
		}
	}}
/>

<div class="flex w-full flex-col gap-4">
	<!-- Toolbar: View Switcher, Search & Zoom Controls -->
	<div
		class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
	>
		<!-- Left: Search Box -->
		<div class="relative max-w-sm flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				aria-label="Search concepts or modules"
				placeholder="🔍 Search concepts or modules..."
				class="w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-text placeholder-text-muted focus:border-primary focus:outline-none"
			/>
			{#if searchQuery}
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					aria-label="Clear search input"
					class="absolute top-2.5 right-3 cursor-pointer text-xs text-text-muted hover:text-text"
				>
					✕
				</button>
			{/if}
		</div>

		<!-- Right: View Mode Toggle & Zoom Actions -->
		<div class="flex items-center gap-2">
			<!-- Dual-Mode Toggle: Graph Canvas vs Accessible Tree View -->
			<div
				class="flex rounded-xl border border-border bg-surface-muted p-0.5 shadow-2xs"
				role="tablist"
				aria-label="Knowledge map display mode"
			>
				<button
					type="button"
					role="tab"
					aria-selected={viewMode === 'canvas'}
					onclick={() => (viewMode = 'canvas')}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition-all {viewMode ===
					'canvas'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
					aria-label="View interactive graph canvas"
				>
					🌐 Graph Canvas
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={viewMode === 'tree'}
					onclick={() => (viewMode = 'tree')}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition-all {viewMode ===
					'tree'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
					aria-label="View accessible hierarchical tree"
				>
					🌳 Accessible Tree
				</button>
			</div>

			<!-- Canvas Zoom Buttons (Only visible in Canvas view) -->
			{#if viewMode === 'canvas'}
				<div
					class="flex items-center rounded-xl border border-border bg-surface p-0.5 shadow-2xs"
					role="group"
					aria-label="Canvas zoom controls"
				>
					<button
						type="button"
						onclick={() => handleZoom(0.15)}
						class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold text-text-muted hover:text-text"
						title="Zoom in"
						aria-label="Zoom in canvas"
					>
						+
					</button>
					<button
						type="button"
						onclick={() => handleZoom(-0.15)}
						class="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold text-text-muted hover:text-text"
						title="Zoom out"
						aria-label="Zoom out canvas"
					>
						-
					</button>
					<button
						type="button"
						onclick={handleResetView}
						class="cursor-pointer rounded-lg px-2 py-1 text-xs font-bold text-text-muted hover:text-text"
						title="Reset zoom and pan"
						aria-label="Reset canvas zoom and pan"
					>
						⟲
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Stale / Calculating Status Banner -->
	{#if isStale}
		<div
			role="status"
			aria-live="polite"
			class="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 shadow-2xs"
		>
			<span aria-hidden="true">⏳</span>
			<span>Updating knowledge graph based on your latest study reviews...</span>
		</div>
	{/if}

	<!-- VIEW MODE 1: Interactive Graph Canvas -->
	{#if viewMode === 'canvas'}
		{#if layoutLoading}
			<div
				class="flex h-96 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
				role="status"
				aria-live="polite"
			>
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
					aria-hidden="true"
				></div>
				<p class="text-xs font-bold text-text-muted">
					Computing ELKjs Hierarchical Knowledge Graph Layout...
				</p>
			</div>
		{:else if !graph || !graph.nodes || graph.nodes.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
			>
				<div class="mb-2 text-3xl" aria-hidden="true">📚</div>
				<h4 class="font-display text-base font-bold text-text">No Knowledge Graph Available</h4>
				<p class="text-xs text-text-muted">
					Complete course modules to build your interactive visual learning map.
				</p>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="relative min-h-125 w-full cursor-grab overflow-hidden rounded-3xl border border-border bg-slate-950 p-4 shadow-inner active:cursor-grabbing"
				onwheel={handleWheel}
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				role="region"
				aria-label="Interactive Knowledge Graph Canvas"
			>
				<!-- Legend -->
				<div
					class="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 text-[11px] font-semibold text-slate-300 shadow-md backdrop-blur-md"
					role="note"
					aria-label="Mastery color and percentage legend"
				>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true"></span>
						<span>Mastered (&ge;80%)</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 rounded-full bg-amber-500" aria-hidden="true"></span>
						<span>Learning (50-80%)</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span class="h-3 w-3 rounded-full bg-rose-500" aria-hidden="true"></span>
						<span>Needs Review (&lt;50%)</span>
					</div>
				</div>

				<!-- SVG Viewport with Pan & Zoom Transform -->
				{#if elkLayout}
					<svg
						class="h-full min-h-125 w-full select-none"
						viewBox="0 0 {elkLayout.width || 800} {elkLayout.height || 600}"
						role="img"
						aria-label="Visual graph of course concepts and modules"
					>
						<g transform="translate({panX}, {panY}) scale({zoomLevel})">
							<!-- Render Clusters (Modules) -->
							{#each elkLayout.children || [] as cluster (cluster.id)}
								{@const modId = cluster.id.replace('cluster-', '')}
								{@const groupInfo = moduleGroups.find((g) => g.moduleId === modId)}
								{@const isCollapsed = collapsedModules.has(modId)}

								<g class="transition-all duration-300">
									<g
										role="button"
										tabindex="0"
										aria-label={`Toggle module cluster ${groupInfo?.title || 'Module'}: currently ${isCollapsed ? 'collapsed' : 'expanded'}`}
										aria-expanded={!isCollapsed}
										onclick={(e) => {
											e.stopPropagation();
											toggleModuleCollapse(modId);
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.stopPropagation();
												toggleModuleCollapse(modId);
											}
										}}
										class="cursor-pointer"
									>
										<rect
											x={cluster.x}
											y={cluster.y}
											width={cluster.width}
											height={cluster.height}
											rx="16"
											fill="#0f172a"
											stroke="#334155"
											stroke-width="2"
											stroke-dasharray={isCollapsed ? '6 6' : undefined}
											class="hover:stroke-slate-400"
										/>
										<text
											x={(cluster.x || 0) + 16}
											y={(cluster.y || 0) + 24}
											fill="#94a3b8"
											font-size="12"
											font-weight="bold"
											font-family="system-ui"
											class="hover:fill-slate-200"
										>
											{isCollapsed ? '▶' : '▼'} 📦 {groupInfo?.title || 'Module'}
										</text>
									</g>

									<!-- Render Nodes inside cluster -->
									{#if !isCollapsed && cluster.children}
										{#each cluster.children as n (n.id)}
											{@const conceptObj = graph.nodes.find((cn) => cn.id === n.id)}
											{@const absoluteX = (cluster.x || 0) + (n.x || 0)}
											{@const absoluteY = (cluster.y || 0) + (n.y || 0)}
											{@const colors = getNodeMasteryColor(modId)}
											{@const isRecommended =
												recommendation?.node?.id === n.id ||
												recommendation?.recommendation?.node?.id === n.id}
											{@const isMatchesSearch =
												searchQuery &&
												(n.labels?.[0]?.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
													n.id.toLowerCase().includes(searchQuery.toLowerCase()))}

											<g
												transform="translate({absoluteX}, {absoluteY})"
												role="button"
												tabindex="0"
												aria-label={`Concept: ${n.labels?.[0]?.text || n.id}. Status: ${colors.label}${isRecommended ? ', Recommended Next' : ''}`}
												onclick={(e) => {
													e.stopPropagation();
													if (conceptObj) selectedNode = conceptObj;
												}}
												onkeydown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.stopPropagation();
														if (conceptObj) selectedNode = conceptObj;
													}
												}}
												class="cursor-pointer transition-transform hover:scale-[1.03]"
											>
												<rect
													width={n.width}
													height={n.height}
													rx="12"
													fill={colors.bg}
													stroke={isMatchesSearch
														? '#38bdf8'
														: isRecommended
															? '#f59e0b'
															: colors.border}
													stroke-width={isMatchesSearch || isRecommended ? '3' : '2'}
												/>
												<text
													x="14"
													y="22"
													fill="#f8fafc"
													font-size="11"
													font-weight="bold"
													font-family="system-ui"
												>
													{n.labels?.[0]?.text || n.id}
												</text>
												<text
													x="14"
													y="38"
													fill={colors.text}
													font-size="10"
													font-weight="bold"
													font-family="system-ui"
												>
													{isRecommended ? '✨ Next Up' : colors.label}
												</text>
											</g>
										{/each}
									{/if}
								</g>
							{/each}
						</g>
					</svg>
				{/if}
			</div>
		{/if}
	{:else}
		<!-- VIEW MODE 2: Accessible Hierarchical Tree (WCAG 2.2 SC 2.5.1 Full Parity) -->
		<div
			class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
			role="region"
			aria-label="Knowledge Map Accessible Tree View"
		>
			<div class="flex items-center justify-between border-b border-border pb-3">
				<div>
					<h3 class="font-display text-base font-bold text-text">🌳 Knowledge Map Hierarchy</h3>
					<p class="text-xs text-text-muted">
						Full keyboard-navigable and screen-reader accessible outline of all courses, modules,
						and concepts.
					</p>
				</div>
			</div>

			<div class="flex flex-col gap-4">
				{#each filteredModuleGroups as group (group.moduleId)}
					{@const colors = getNodeMasteryColor(group.moduleId)}
					<div
						class="flex flex-col gap-2 rounded-2xl border border-border/80 bg-surface-muted/40 p-4"
					>
						<!-- Module Header -->
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="text-base" aria-hidden="true">📦</span>
								<h4 class="font-display text-sm font-bold text-text">{group.title}</h4>
								<span
									class="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
									style="background-color: {colors.bg}; color: {colors.text}; border: 1px solid {colors.border};"
								>
									{group.mastery.masteryPercent >= 0
										? `${group.mastery.masteryPercent}% Mastery`
										: 'Not Assessed'}
								</span>
							</div>

							<div class="flex items-center gap-2">
								{#if group.mastery.questionsDue > 0}
									<span
										class="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400"
									>
										{group.mastery.questionsDue} Due
									</span>
								{/if}
							</div>
						</div>

						<!-- Concept Nodes List -->
						<div class="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
							{#each group.nodes as node (node.id)}
								{@const isRecommended =
									recommendation?.node?.id === node.id ||
									recommendation?.recommendation?.node?.id === node.id}
								<div
									class="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/50 {isRecommended
										? 'border-amber-500/60 bg-amber-500/5'
										: ''}"
									onclick={() => (selectedNode = node)}
									onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectedNode = node)}
									role="button"
									tabindex="0"
									aria-label={`Concept: ${node.label}, ID: ${node.id}${isRecommended ? ', Recommended Next' : ''}`}
								>
									<div class="flex flex-col gap-0.5">
										<div class="flex items-center gap-1.5">
											<span class="text-xs font-bold text-text">{node.label}</span>
											{#if isRecommended}
												<span
													class="py-0.2 rounded-full bg-amber-500/20 px-1.5 text-[9px] font-bold text-amber-400"
												>
													✨ Next
												</span>
											{/if}
										</div>
										<span class="text-[10px] font-semibold text-text-muted">{node.id}</span>
									</div>
									<span class="text-xs font-bold text-primary" aria-hidden="true">&rarr;</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Selected Concept Node Detail Action Drawer / Panel -->
	{#if selectedNode}
		{@const nodeMastery = mastery[selectedNode.moduleId]}
		{@const masteryPct = nodeMastery ? nodeMastery.masteryPercent : -1}
		{@const dueCount = nodeMastery ? nodeMastery.questionsDue : 0}
		{@const avgStability = nodeMastery ? nodeMastery.averageStability : 0}

		<div
			class="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-surface p-6 shadow-xl"
			role="region"
			aria-labelledby="selected-node-title"
			aria-live="polite"
		>
			<div class="flex items-start justify-between">
				<div>
					<div class="flex items-center gap-2">
						<span
							class="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-black tracking-wider text-primary uppercase"
						>
							Concept Knowledge Node
						</span>
						{#if masteryPct >= 80}
							<span
								class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400"
							>
								🟢 Mastered
							</span>
						{:else if masteryPct >= 40}
							<span
								class="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary"
							>
								🔵 Reviewing
							</span>
						{:else if masteryPct >= 0}
							<span
								class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400"
							>
								🟡 Learning
							</span>
						{:else}
							<span
								class="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-text-muted"
							>
								⚪ Not Assessed
							</span>
						{/if}
					</div>
					<h3 id="selected-node-title" class="mt-1 font-display text-lg font-bold text-text">
						{selectedNode.label}
					</h3>
					<p class="text-xs text-text-muted">
						Part of: <strong class="text-text">{selectedNode.moduleTitle || 'Module'}</strong>
					</p>
				</div>
				<button
					type="button"
					onclick={() => (selectedNode = null)}
					class="cursor-pointer rounded-lg p-1.5 text-xs font-bold text-text-muted hover:bg-surface-muted hover:text-text"
					aria-label="Close concept panel"
				>
					✕
				</button>
			</div>

			<!-- AI Recommendation Callout if Selected Node is Recommended -->
			{#if recommendation && (selectedNode.id === recommendation.node?.id || selectedNode.id === recommendation.recommendation?.node?.id)}
				<div
					class="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-300"
				>
					<span class="text-base">✨</span>
					<div class="flex flex-col gap-0.5">
						<span class="font-bold">Recommended Learning Path Priority</span>
						<p class="text-amber-200/90">
							{recommendation.reason ||
								recommendation.recommendation?.reason ||
								'Recommended next step for your curriculum progression.'}
						</p>
					</div>
				</div>
			{/if}

			<!-- Prerequisite Edge Flagging -->
			{#if onFlagEdge && (graph?.edges || []).some((e) => e.target === selectedNode?.id)}
				{@const inEdges = (graph?.edges || []).filter((e) => e.target === selectedNode?.id)}
				<div
					class="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface-muted/30 p-2.5 text-[11px] text-text-muted"
				>
					<span class="font-semibold">Prerequisites:</span>
					{#each inEdges as edge (`${edge.source}->${edge.target}`)}
						<button
							type="button"
							onclick={() => onFlagEdge?.(edge.source, edge.target)}
							class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[10px] font-medium text-text-muted transition-colors hover:border-rose-500/50 hover:text-rose-400"
							title="Flag prerequisite relation as inaccurate"
						>
							<span>🚩 Flag {edge.source}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Real Metrics Grid & Confidence Level -->
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-xl border border-border bg-surface-muted p-3">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Module Mastery</span>
					<span class="font-display text-sm font-bold text-text">
						{masteryPct >= 0 ? `${masteryPct}%` : 'Not Assessed'}
					</span>
				</div>

				<div class="rounded-xl border border-border bg-surface-muted p-3">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Confidence Level</span
					>
					<span
						class="font-display text-sm font-bold {nodeMastery?.confidenceLevel === 'high'
							? 'text-emerald-400'
							: nodeMastery?.confidenceLevel === 'medium'
								? 'text-blue-400'
								: 'text-amber-400'}"
					>
						{nodeMastery?.confidenceLevel
							? `${nodeMastery.confidenceLevel.toUpperCase()}`
							: 'ESTIMATE'}
						<span class="text-[10px] font-normal text-text-muted"
							>({nodeMastery?.evidenceCount ?? 0} ev.)</span
						>
					</span>
				</div>

				<div class="rounded-xl border border-border bg-surface-muted p-3">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Questions Due</span>
					<span
						class="font-display text-sm font-bold {dueCount > 0 ? 'text-amber-400' : 'text-text'}"
					>
						{dueCount} Due
					</span>
				</div>

				<div class="rounded-xl border border-border bg-surface-muted p-3">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Memory Stability</span
					>
					<span class="font-display text-sm font-bold text-text">
						{avgStability > 0 ? `${avgStability}d avg` : 'New'}
					</span>
				</div>
			</div>

			<!-- Formula Breakdown Mini-Bar -->
			{#if nodeMastery?.masteryBreakdown}
				<div class="rounded-xl border border-border/80 bg-surface-muted/50 p-3.5 text-xs">
					<div class="mb-2 flex items-center justify-between font-semibold text-text">
						<span>Mastery Evidence Breakdown</span>
						<span class="text-[11px] font-normal text-text-muted">Weighted Heuristic</span>
					</div>
					<div class="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
						<div class="flex flex-col">
							<span class="text-text-muted">Quiz (45%):</span>
							<strong class="text-text">{nodeMastery.masteryBreakdown.quizAccuracy}%</strong>
						</div>
						<div class="flex flex-col">
							<span class="text-text-muted">FSRS (35%):</span>
							<strong class="text-text">{nodeMastery.masteryBreakdown.fsrsPerformance}%</strong>
						</div>
						<div class="flex flex-col">
							<span class="text-text-muted">Recency (15%):</span>
							<strong class="text-text">{nodeMastery.masteryBreakdown.recencyScore}%</strong>
						</div>
						<div class="flex flex-col">
							<span class="text-text-muted">Lesson (5%):</span>
							<strong class="text-text">{nodeMastery.masteryBreakdown.lessonCompletion}%</strong>
						</div>
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex flex-wrap items-center gap-2.5 border-t border-border/80 pt-3">
				{#if onNodeAction}
					<button
						type="button"
						onclick={() => selectedNode && onNodeAction(selectedNode, 'lesson')}
						class="cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-primary-hover active:scale-95"
					>
						📖 Study Lesson
					</button>

					<button
						type="button"
						onclick={() => selectedNode && onNodeAction(selectedNode, 'review')}
						class="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-400 transition-all hover:bg-amber-500/20 active:scale-95"
					>
						🧠 Drill Memory Cards
					</button>
				{/if}

				<button
					type="button"
					onclick={() => {
						if (!selectedNode) return;
						chatStore.seedMessage = `Can you explain the concept "${selectedNode.label}" and give me a practical exercise to test my understanding?`;
						if (!chatStore.isOpen) chatStore.isOpen = true;
					}}
					class="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text transition-all hover:border-primary hover:text-primary active:scale-95"
				>
					✨ Ask AI Tutor
				</button>
			</div>
		</div>
	{/if}
</div>
