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

<div class="gap-4 flex w-full flex-col">
	<!-- Toolbar: View Switcher, Search & Zoom Controls -->
	<div
		class="gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between flex flex-col border border-border bg-surface shadow-sm"
	>
		<!-- Left: Search Box -->
		<div class="max-w-sm relative flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="🔍 Search concepts or modules..."
				class="px-3.5 py-2 text-xs font-semibold w-full rounded-xl border border-border bg-surface-muted text-text placeholder-text-muted focus:border-primary focus:outline-none"
			/>
			{#if searchQuery}
				<button
					type="button"
					onclick={() => (searchQuery = '')}
					class="top-2.5 right-3 text-xs absolute text-text-muted hover:text-text"
				>
					✕
				</button>
			{/if}
		</div>

		<!-- Right: View Mode Toggle & Zoom Actions -->
		<div class="gap-2 flex items-center">
			<!-- Dual-Mode Toggle: Graph Canvas vs Accessible Tree View -->
			<div class="p-0.5 shadow-2xs flex rounded-xl border border-border bg-surface-muted">
				<button
					type="button"
					onclick={() => (viewMode = 'canvas')}
					class="px-3 py-1.5 text-xs font-bold cursor-pointer rounded-lg transition-all {viewMode ===
					'canvas'
						? 'text-white shadow-xs bg-primary'
						: 'text-text-muted hover:text-text'}"
					aria-label="View interactive graph canvas"
				>
					🌐 Graph Canvas
				</button>
				<button
					type="button"
					onclick={() => (viewMode = 'tree')}
					class="px-3 py-1.5 text-xs font-bold cursor-pointer rounded-lg transition-all {viewMode ===
					'tree'
						? 'text-white shadow-xs bg-primary'
						: 'text-text-muted hover:text-text'}"
					aria-label="View accessible hierarchical tree"
				>
					🌳 Accessible Tree
				</button>
			</div>

			<!-- Canvas Zoom Buttons (Only visible in Canvas view) -->
			{#if viewMode === 'canvas'}
				<div class="p-0.5 shadow-2xs flex items-center rounded-xl border border-border bg-surface">
					<button
						type="button"
						onclick={() => handleZoom(0.15)}
						class="px-2.5 py-1 text-xs font-bold cursor-pointer rounded-lg text-text-muted hover:text-text"
						title="Zoom in"
						aria-label="Zoom in"
					>
						+
					</button>
					<button
						type="button"
						onclick={() => handleZoom(-0.15)}
						class="px-2.5 py-1 text-xs font-bold cursor-pointer rounded-lg text-text-muted hover:text-text"
						title="Zoom out"
						aria-label="Zoom out"
					>
						-
					</button>
					<button
						type="button"
						onclick={handleResetView}
						class="px-2 py-1 text-xs font-bold cursor-pointer rounded-lg text-text-muted hover:text-text"
						title="Reset zoom and pan"
						aria-label="Reset zoom and pan"
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
			class="gap-2 border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 shadow-2xs flex items-center rounded-xl border"
		>
			<span>⏳</span>
			<span>Updating knowledge graph based on your latest study reviews...</span>
		</div>
	{/if}

	<!-- VIEW MODE 1: Interactive Graph Canvas -->
	{#if viewMode === 'canvas'}
		{#if layoutLoading}
			<div
				class="h-96 gap-3 rounded-3xl p-12 shadow-xs flex w-full flex-col items-center justify-center border border-border bg-surface text-center"
			>
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
				></div>
				<p class="text-xs font-bold text-text-muted">
					Computing ELKjs Hierarchical Knowledge Graph Layout...
				</p>
			</div>
		{:else if !graph || !graph.nodes || graph.nodes.length === 0}
			<div
				class="rounded-3xl p-12 shadow-xs flex flex-col items-center justify-center border border-border bg-surface text-center"
			>
				<div class="mb-2 text-3xl">📚</div>
				<h4 class="font-display text-base font-bold text-text">No Knowledge Graph Available</h4>
				<p class="text-xs text-text-muted">
					Complete course modules to build your interactive visual learning map.
				</p>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="min-h-125 rounded-3xl bg-slate-950 p-4 shadow-inner relative w-full cursor-grab overflow-hidden border border-border active:cursor-grabbing"
				onwheel={handleWheel}
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
			>
				<!-- Legend -->
				<div
					class="top-4 right-4 gap-3 rounded-2xl border-slate-800 bg-slate-900/90 p-3 font-semibold text-slate-300 backdrop-blur-md absolute z-10 flex flex-wrap items-center border text-[11px] shadow-md"
				>
					<div class="gap-1.5 flex items-center">
						<span class="h-3 w-3 bg-emerald-500 rounded-full"></span>
						<span>Mastered (&ge;80%)</span>
					</div>
					<div class="gap-1.5 flex items-center">
						<span class="h-3 w-3 bg-amber-500 rounded-full"></span>
						<span>Learning (50-80%)</span>
					</div>
					<div class="gap-1.5 flex items-center">
						<span class="h-3 w-3 bg-rose-500 rounded-full"></span>
						<span>Needs Review (&lt;50%)</span>
					</div>
				</div>

				<!-- SVG Viewport with Pan & Zoom Transform -->
				{#if elkLayout}
					<svg
						class="min-h-125 h-full w-full select-none"
						viewBox="0 0 {elkLayout.width || 800} {elkLayout.height || 600}"
					>
						<g transform="translate({panX}, {panY}) scale({zoomLevel})">
							<!-- Render Clusters (Modules) -->
							{#each elkLayout.children || [] as cluster (cluster.id)}
								{@const modId = cluster.id.replace('cluster-', '')}
								{@const groupInfo = moduleGroups.find((g) => g.moduleId === modId)}
								{@const isCollapsed = collapsedModules.has(modId)}

								<g class="transition-all duration-300">
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
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
										onclick={(e) => {
											e.stopPropagation();
											toggleModuleCollapse(modId);
										}}
										class="hover:stroke-slate-400 cursor-pointer"
									/>
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<text
										x={(cluster.x || 0) + 16}
										y={(cluster.y || 0) + 24}
										fill="#94a3b8"
										font-size="12"
										font-weight="bold"
										font-family="system-ui"
										onclick={(e) => {
											e.stopPropagation();
											toggleModuleCollapse(modId);
										}}
										class="hover:fill-slate-200 cursor-pointer"
									>
										{isCollapsed ? '▶' : '▼'} 📦 {groupInfo?.title || 'Module'}
									</text>

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

											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<g
												transform="translate({absoluteX}, {absoluteY})"
												onclick={(e) => {
													e.stopPropagation();
													if (conceptObj) selectedNode = conceptObj;
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
			class="gap-4 rounded-3xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
		>
			<div class="pb-3 flex items-center justify-between border-b border-border">
				<div>
					<h3 class="font-display text-base font-bold text-text">🌳 Knowledge Map Hierarchy</h3>
					<p class="text-xs text-text-muted">
						Full keyboard-navigable and screen-reader accessible outline of all courses, modules,
						and concepts.
					</p>
				</div>
			</div>

			<div class="gap-4 flex flex-col">
				{#each filteredModuleGroups as group (group.moduleId)}
					{@const colors = getNodeMasteryColor(group.moduleId)}
					<div
						class="gap-2 rounded-2xl p-4 flex flex-col border border-border/80 bg-surface-muted/40"
					>
						<!-- Module Header -->
						<div class="gap-2 flex flex-wrap items-center justify-between">
							<div class="gap-2 flex items-center">
								<span class="text-base">📦</span>
								<h4 class="font-display text-sm font-bold text-text">{group.title}</h4>
								<span
									class="px-2.5 py-0.5 font-bold rounded-full text-[10px]"
									style="background-color: {colors.bg}; color: {colors.text}; border: 1px solid {colors.border};"
								>
									{group.mastery.masteryPercent >= 0
										? `${group.mastery.masteryPercent}% Mastery`
										: 'Not Assessed'}
								</span>
							</div>

							<div class="gap-2 flex items-center">
								{#if group.mastery.questionsDue > 0}
									<span
										class="bg-amber-500/20 px-2 py-0.5 font-bold text-amber-400 rounded-md text-[10px]"
									>
										{group.mastery.questionsDue} Due
									</span>
								{/if}
							</div>
						</div>

						<!-- Concept Nodes List -->
						<div class="gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
							{#each group.nodes as node (node.id)}
								{@const isRecommended =
									recommendation?.node?.id === node.id ||
									recommendation?.recommendation?.node?.id === node.id}
								<div
									class="p-3 flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface transition-colors hover:border-primary/50 {isRecommended
										? 'border-amber-500/60 bg-amber-500/5'
										: ''}"
									onclick={() => (selectedNode = node)}
									onkeydown={(e) => e.key === 'Enter' && (selectedNode = node)}
									role="button"
									tabindex="0"
								>
									<div class="gap-0.5 flex flex-col">
										<div class="gap-1.5 flex items-center">
											<span class="text-xs font-bold text-text">{node.label}</span>
											{#if isRecommended}
												<span
													class="py-0.2 bg-amber-500/20 px-1.5 font-bold text-amber-400 rounded-full text-[9px]"
												>
													✨ Next
												</span>
											{/if}
										</div>
										<span class="font-semibold text-[10px] text-text-muted">{node.id}</span>
									</div>
									<span class="text-xs font-bold text-primary">&rarr;</span>
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

		<div class="gap-4 rounded-3xl p-6 shadow-xl flex flex-col border border-primary/30 bg-surface">
			<div class="flex items-start justify-between">
				<div>
					<div class="gap-2 flex items-center">
						<span
							class="px-2.5 py-0.5 font-black tracking-wider rounded-full bg-primary-soft text-[10px] text-primary uppercase"
						>
							Concept Knowledge Node
						</span>
						{#if masteryPct >= 80}
							<span
								class="bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 rounded-full text-[10px]"
							>
								🟢 Mastered
							</span>
						{:else if masteryPct >= 40}
							<span
								class="px-2 py-0.5 font-bold rounded-full bg-primary-soft text-[10px] text-primary"
							>
								🔵 Reviewing
							</span>
						{:else if masteryPct >= 0}
							<span
								class="bg-amber-500/20 px-2 py-0.5 font-bold text-amber-400 rounded-full text-[10px]"
							>
								🟡 Learning
							</span>
						{:else}
							<span
								class="px-2 py-0.5 font-bold rounded-full bg-surface-muted text-[10px] text-text-muted"
							>
								⚪ Not Assessed
							</span>
						{/if}
					</div>
					<h3 class="mt-1 font-display text-lg font-bold text-text">{selectedNode.label}</h3>
					<p class="text-xs text-text-muted">
						Part of: <strong class="text-text">{selectedNode.moduleTitle || 'Module'}</strong>
					</p>
				</div>
				<button
					type="button"
					onclick={() => (selectedNode = null)}
					class="p-1.5 text-xs font-bold cursor-pointer rounded-lg text-text-muted hover:bg-surface-muted hover:text-text"
					aria-label="Close concept panel"
				>
					✕
				</button>
			</div>

			<!-- AI Recommendation Callout if Selected Node is Recommended -->
			{#if recommendation && (selectedNode.id === recommendation.node?.id || selectedNode.id === recommendation.recommendation?.node?.id)}
				<div
					class="gap-2.5 rounded-2xl border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-300 flex items-start border"
				>
					<span class="text-base">✨</span>
					<div class="gap-0.5 flex flex-col">
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
					class="gap-2 p-2.5 flex flex-wrap items-center rounded-xl border border-border/60 bg-surface-muted/30 text-[11px] text-text-muted"
				>
					<span class="font-semibold">Prerequisites:</span>
					{#each inEdges as edge (`${edge.source}->${edge.target}`)}
						<button
							type="button"
							onclick={() => onFlagEdge?.(edge.source, edge.target)}
							class="gap-1 px-2 py-1 font-medium hover:border-rose-500/50 hover:text-rose-400 inline-flex cursor-pointer items-center rounded-lg border border-border bg-surface text-[10px] text-text-muted transition-colors"
							title="Flag prerequisite relation as inaccurate"
						>
							<span>🚩 Flag {edge.source}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Real Metrics Grid & Confidence Level -->
			<div class="gap-3 sm:grid-cols-4 grid grid-cols-2">
				<div class="p-3 rounded-xl border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Module Mastery</span>
					<span class="font-display text-sm font-bold text-text">
						{masteryPct >= 0 ? `${masteryPct}%` : 'Not Assessed'}
					</span>
				</div>

				<div class="p-3 rounded-xl border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Confidence Level</span
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
						<span class="font-normal text-[10px] text-text-muted"
							>({nodeMastery?.evidenceCount ?? 0} ev.)</span
						>
					</span>
				</div>

				<div class="p-3 rounded-xl border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Questions Due</span>
					<span
						class="font-display text-sm font-bold {dueCount > 0 ? 'text-amber-400' : 'text-text'}"
					>
						{dueCount} Due
					</span>
				</div>

				<div class="p-3 rounded-xl border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Memory Stability</span
					>
					<span class="font-display text-sm font-bold text-text">
						{avgStability > 0 ? `${avgStability}d avg` : 'New'}
					</span>
				</div>
			</div>

			<!-- Formula Breakdown Mini-Bar -->
			{#if nodeMastery?.masteryBreakdown}
				<div class="p-3.5 text-xs rounded-xl border border-border/80 bg-surface-muted/50">
					<div class="mb-2 font-semibold flex items-center justify-between text-text">
						<span>Mastery Evidence Breakdown</span>
						<span class="font-normal text-[11px] text-text-muted">Weighted Heuristic</span>
					</div>
					<div class="gap-2 sm:grid-cols-4 grid grid-cols-2 text-[11px]">
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
			<div class="gap-2.5 pt-3 flex flex-wrap items-center border-t border-border/80">
				{#if onNodeAction}
					<button
						type="button"
						onclick={() => selectedNode && onNodeAction(selectedNode, 'lesson')}
						class="px-4 py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover active:scale-95"
					>
						📖 Study Lesson
					</button>

					<button
						type="button"
						onclick={() => selectedNode && onNodeAction(selectedNode, 'review')}
						class="border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 cursor-pointer rounded-xl border transition-all active:scale-95"
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
					class="px-4 py-2.5 text-xs font-bold cursor-pointer rounded-xl border border-border bg-surface text-text transition-all hover:border-primary hover:text-primary active:scale-95"
				>
					✨ Ask AI Tutor
				</button>
			</div>
		</div>
	{/if}
</div>
