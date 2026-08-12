<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
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
		recommendation,
		isStale = false,
		onNodeAction,
		onFlagEdge
	}: Props = $props();

	// Layout State
	let elkLayout = $state<ElkNode | null>(null);
	let layoutLoading = $state(true);
	let selectedNode = $state<ConceptNode | null>(null);
	let collapsedModules = new SvelteSet<string>();
	let mobileTab = $state<'graph' | 'list'>('graph');

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

				// Fixed dimensions for concept nodes
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
					// Collapsed module cluster represented as a single box
					elkChildren.push({
						id: `cluster-${modId}`,
						width: 220,
						height: 70,
						labels: [{ text: `📦 ${modTitle}` }]
					});
				} else {
					// Expanded compound node
					elkChildren.push({
						id: `cluster-${modId}`,
						layoutOptions: {
							'elk.algorithm': 'layered',
							'elk.direction': 'DOWN',
							'elk.spacing.nodeNode': '25',
							'elk.layered.spacing.nodeNodeBetweenLayers': '35'
						},
						children: childNodes,
						labels: [{ text: modTitle }]
					});
				}
			}

			const elkEdges: ElkExtendedEdge[] = (graph.edges || []).map((e, idx) => ({
				id: `e-${idx}-${e.source}-${e.target}`,
				sources: [e.source],
				targets: [e.target]
			}));

			const elkGraph: ElkNode = {
				id: 'root',
				layoutOptions: {
					'elk.algorithm': 'layered',
					'elk.direction': 'DOWN',
					'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
					'elk.spacing.nodeNode': '35',
					'elk.layered.spacing.nodeNodeBetweenLayers': '60'
				},
				children: elkChildren,
				edges: elkEdges
			};

			const result = await elk.layout(elkGraph);
			elkLayout = result;
		} catch (err) {
			console.error('ELK layout error:', err);
		} finally {
			layoutLoading = false;
		}
	}

	$effect(() => {
		if (graph) {
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

	function getNodeMasteryColor(moduleId: string) {
		const m = mastery[moduleId];
		if (!m || m.fsrsState === 'not-assessed')
			return { bg: '#334155', border: '#475569', text: '#94a3b8', label: 'Not Assessed' };
		if (m.fsrsState === 'not-started')
			return { bg: '#1e293b', border: '#64748b', text: '#cbd5e1', label: '0% Not Started' };
		if (m.masteryPercent < 50)
			return {
				bg: '#450a0a',
				border: '#ef4444',
				text: '#fca5a5',
				label: `${m.masteryPercent}% Weak`
			};
		if (m.masteryPercent < 80)
			return {
				bg: '#451a03',
				border: '#f59e0b',
				text: '#fde68a',
				label: `${m.masteryPercent}% Learning`
			};
		return {
			bg: '#064e3b',
			border: '#10b981',
			text: '#a7f3d0',
			label: `${m.masteryPercent}% Mastered`
		};
	}

	function handleActionClick(node: ConceptNode, actionType: 'lesson' | 'quiz' | 'review') {
		selectedNode = null;
		if (onNodeAction) onNodeAction(node, actionType);
	}

	async function handleFlagEdgeClick(source: string, target: string) {
		if (onFlagEdge) {
			await onFlagEdge(source, target);
		}
	}
</script>

<div class="flex w-full flex-col gap-6 select-none">
	<!-- Stale Indicator Banner -->
	{#if isStale}
		<div
			class="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-400"
		>
			<span>⚡ Updating Knowledge Map in the background as lesson content was modified...</span>
		</div>
	{/if}

	<!-- "Recommended Next" Prominent Action Banner -->
	{#if recommendation}
		{@const recNode = recommendation.node}
		{@const recMastery = mastery[recNode.moduleId]}
		<div
			class="relative overflow-hidden rounded-3xl border border-primary/40 bg-linear-to-r from-primary/20 via-surface to-surface p-6 shadow-lg sm:p-7"
		>
			<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div class="flex items-start gap-4">
					<div
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl shadow-md"
					>
						🎯
					</div>
					<div class="flex flex-col gap-1">
						<div
							class="inline-flex items-center gap-2 text-[11px] font-bold tracking-wider text-primary uppercase"
						>
							<span>Recommended Next Action</span>
							{#if recMastery}
								<span
									class="rounded-full bg-primary/20 px-2.5 py-0.5 font-mono text-[10px] text-primary"
								>
									Module Mastery: {recMastery.masteryPercent < 0
										? 'Not Assessed'
										: `${recMastery.masteryPercent}%`}
								</span>
							{/if}
						</div>
						<h3 class="font-display text-lg font-bold text-text sm:text-xl">
							Focus on "{recNode.label}" ({recNode.moduleTitle || 'Module'})
						</h3>
						<p class="max-w-2xl text-xs leading-relaxed text-text-muted">
							{recommendation.reason}
						</p>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						onclick={() =>
							handleActionClick(recNode, recMastery?.questionsTotal ? 'quiz' : 'lesson')}
						class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md shadow-primary/30 transition-all hover:bg-primary-hover active:scale-95"
					>
						<span>Study Module Now &rarr;</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- View Switcher & Toolbar -->
	<div class="flex items-center justify-between border-b border-border/60 pb-3">
		<div class="flex items-center gap-2">
			<span class="font-display text-sm font-bold text-text">🧠 Interactive Learning Map</span>
			{#if graph?.nodes}
				<span
					class="rounded-full bg-surface-muted px-2.5 py-0.5 font-mono text-[11px] text-text-muted"
				>
					{graph.nodes.length} Concepts &bull; {moduleGroups.length} Modules
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<div class="inline-flex rounded-xl bg-surface-muted p-1 sm:hidden">
				<button
					type="button"
					onclick={() => (mobileTab = 'graph')}
					class="rounded-lg px-3 py-1 text-xs font-bold transition-all {mobileTab === 'graph'
						? 'bg-primary text-white'
						: 'text-text-muted'}"
				>
					🕸️ Graph
				</button>
				<button
					type="button"
					onclick={() => (mobileTab = 'list')}
					class="rounded-lg px-3 py-1 text-xs font-bold transition-all {mobileTab === 'list'
						? 'bg-primary text-white'
						: 'text-text-muted'}"
				>
					📋 List
				</button>
			</div>
		</div>
	</div>

	<!-- Main Map Body -->
	{#if layoutLoading}
		<div
			class="flex h-96 w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
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
			class="flex flex-col items-center justify-center rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
		>
			<div class="mb-2 text-3xl">📚</div>
			<h4 class="font-display text-base font-bold text-text">No Knowledge Graph Available</h4>
			<p class="text-xs text-text-muted">
				Module content is still generating. Complete course modules to build your interactive
				learning map.
			</p>
		</div>
	{:else if mobileTab === 'graph'}
		<!-- SVG Graphical Map -->
		<div
			class="relative min-h-125 w-full overflow-hidden rounded-3xl border border-border bg-slate-950 p-4 shadow-inner"
		>
			<!-- Legend -->
			<div
				class="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 text-[11px] font-semibold text-slate-300 shadow-md backdrop-blur-md"
			>
				<div class="flex items-center gap-1.5">
					<span class="h-3 w-3 rounded-full bg-emerald-500"></span>
					<span>Mastered (&ge;80%)</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="h-3 w-3 rounded-full bg-amber-500"></span>
					<span>Learning (50-80%)</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="h-3 w-3 rounded-full bg-rose-500"></span>
					<span>Weak (&lt;50%)</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="h-3 w-3 rounded-full bg-slate-600"></span>
					<span>Not Assessed / Started</span>
				</div>
			</div>

			<!-- SVG Graph Viewport -->
			{#if elkLayout}
				<svg
					class="h-full min-h-125 w-full"
					viewBox="0 0 {elkLayout.width || 800} {elkLayout.height || 600}"
				>
					<defs>
						<marker
							id="arrowhead"
							markerWidth="10"
							markerHeight="7"
							refX="9"
							refY="3.5"
							orient="auto"
						>
							<polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
						</marker>
					</defs>

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
								onclick={() => toggleModuleCollapse(modId)}
								class="cursor-pointer hover:stroke-slate-400"
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
								onclick={() => toggleModuleCollapse(modId)}
								class="cursor-pointer hover:fill-slate-200"
							>
								{isCollapsed ? '▶' : '▼'} 📦 {groupInfo?.title || 'Module'}
							</text>

							<!-- Render Nodes inside cluster if not collapsed -->
							{#if !isCollapsed && cluster.children}
								{#each cluster.children as n (n.id)}
									{@const conceptObj = graph.nodes.find((cn) => cn.id === n.id)}
									{@const absoluteX = (cluster.x || 0) + (n.x || 0)}
									{@const absoluteY = (cluster.y || 0) + (n.y || 0)}
									{@const colors = getNodeMasteryColor(modId)}
									{@const isWeak =
										mastery[modId]?.masteryPercent >= 0 && mastery[modId]?.masteryPercent < 50}

									<!-- Node Group -->
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<g
										transform="translate({absoluteX}, {absoluteY})"
										onclick={() => conceptObj && (selectedNode = conceptObj)}
										class="cursor-pointer transition-transform hover:scale-[1.03]"
									>
										<rect
											width={n.width}
											height={n.height}
											rx="12"
											fill={colors.bg}
											stroke={colors.border}
											stroke-width="2"
											class={isWeak ? 'animate-pulse' : ''}
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
											font-size="9"
											font-weight="bold"
											font-family="system-ui"
										>
											{colors.label}
										</text>
									</g>
								{/each}
							{/if}
						</g>
					{/each}
				</svg>
			{/if}
		</div>
	{:else}
		<!-- Mobile List View -->
		<div class="flex flex-col gap-4">
			{#each moduleGroups as group (group.moduleId)}
				{@const colors = getNodeMasteryColor(group.moduleId)}
				<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs">
					<div class="flex items-center justify-between border-b border-border/50 pb-3">
						<div>
							<span class="text-[10px] font-bold text-text-muted uppercase">Module</span>
							<h4 class="font-display text-base font-bold text-text">{group.title}</h4>
						</div>
						<span
							class="rounded-full px-3 py-1 font-mono text-xs font-bold"
							style="background-color: {colors.bg}; color: {colors.text}; border: 1px solid {colors.border}"
						>
							{colors.label}
						</span>
					</div>

					<div class="flex flex-col gap-2">
						{#each group.nodes as concept (concept.id)}
							{@const prereqs = (graph?.edges || []).filter((e) => e.target === concept.id)}
							<div
								class="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-muted/40 p-3"
							>
								<div class="flex items-center justify-between">
									<div class="flex flex-col">
										<span class="text-xs font-bold text-text">{concept.label}</span>
										<span class="text-[10px] text-text-muted">ID: {concept.id}</span>
									</div>

									<div class="flex items-center gap-2">
										<button
											type="button"
											onclick={() =>
												handleActionClick(
													concept,
													group.mastery.questionsTotal ? 'quiz' : 'lesson'
												)}
											class="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white hover:bg-primary-hover"
										>
											Study
										</button>
									</div>
								</div>

								{#if prereqs.length > 0}
									<div
										class="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2 text-[10px] text-text-muted"
									>
										<span class="font-semibold">Prerequisite Connections:</span>
										{#each prereqs as edge (edge.source)}
											<div
												class="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5"
											>
												<span>← {edge.source}</span>
												<button
													type="button"
													onclick={() => handleFlagEdgeClick(edge.source, edge.target)}
													class="ml-1 font-bold text-danger hover:underline"
													title="Flag edge as inaccurate"
												>
													🚩 Flag
												</button>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Node Popover / Action Modal -->
	{#if selectedNode}
		{@const nodeModMastery = mastery[selectedNode.moduleId]}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4 backdrop-blur-xs"
		>
			<div
				class="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-2xl"
			>
				<div class="flex items-start justify-between">
					<div>
						<span class="text-[10px] font-bold text-primary uppercase">Concept Node</span>
						<h3 class="font-display text-lg font-bold text-text">{selectedNode.label}</h3>
						<p class="text-xs text-text-muted">
							Parent Module: {selectedNode.moduleTitle || 'Module'}
						</p>
					</div>
					<button
						type="button"
						onclick={() => (selectedNode = null)}
						class="text-xs font-bold text-text-muted hover:text-text"
					>
						✕
					</button>
				</div>

				<div class="rounded-xl border border-border bg-surface-muted p-3 text-xs text-text-muted">
					<div class="flex justify-between py-0.5">
						<span>Module Mastery Score:</span>
						<strong class="text-text"
							>{nodeModMastery
								? nodeModMastery.masteryPercent < 0
									? 'Not Assessed'
									: `${nodeModMastery.masteryPercent}%`
								: 'N/A'}</strong
						>
					</div>
					<div class="flex justify-between py-0.5">
						<span>FSRS Review State:</span>
						<strong class="text-text uppercase">{nodeModMastery?.fsrsState || 'N/A'}</strong>
					</div>
					<div class="flex justify-between py-0.5">
						<span>Questions Due Today:</span>
						<strong class="text-text">{nodeModMastery?.questionsDue ?? 0}</strong>
					</div>
				</div>

				<div class="flex flex-col gap-2 pt-2">
					<button
						type="button"
						onclick={() => handleActionClick(selectedNode!, 'lesson')}
						class="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-surface p-3 text-xs font-bold text-text hover:border-primary"
					>
						<span>📖 Read Lesson Module</span>
						<span>&rarr;</span>
					</button>
					{#if nodeModMastery && nodeModMastery.questionsTotal > 0}
						<button
							type="button"
							onclick={() => handleActionClick(selectedNode!, 'quiz')}
							class="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-surface p-3 text-xs font-bold text-text hover:border-primary"
						>
							<span>📝 Take Module Quiz</span>
							<span>&rarr;</span>
						</button>
						<button
							type="button"
							onclick={() => handleActionClick(selectedNode!, 'review')}
							class="flex w-full cursor-pointer items-center justify-between rounded-xl bg-primary p-3 text-xs font-bold text-white shadow-xs hover:bg-primary-hover"
						>
							<span>🧠 Start Spaced Repetition Review</span>
							<span>&rarr;</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
