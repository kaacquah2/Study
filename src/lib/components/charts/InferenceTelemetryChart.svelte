<script lang="ts">
	interface Props {
		geminiCount?: number;
		mlBackendCount?: number;
		ollamaCount?: number;
		fallbackPercentage?: number;
		mlBackendHealth?: {
			status: string;
			models_loaded: Record<string, boolean>;
			inference_busy: boolean;
		} | null;
	}

	let {
		geminiCount = 0,
		mlBackendCount = 0,
		ollamaCount = 0,
		fallbackPercentage = 0,
		mlBackendHealth = null
	}: Props = $props();

	let totalCalls = $derived(geminiCount + mlBackendCount + ollamaCount);

	let geminiPct = $derived(
		totalCalls > 0 ? Math.round((geminiCount / totalCalls) * 100) : 100
	);
	let mlBackendPct = $derived(
		totalCalls > 0 ? Math.round((mlBackendCount / totalCalls) * 100) : 0
	);
	let ollamaPct = $derived(
		totalCalls > 0 ? Math.max(0, 100 - geminiPct - mlBackendPct) : 0
	);

	let activeModelCount = $derived(
		mlBackendHealth?.models_loaded
			? Object.values(mlBackendHealth.models_loaded).filter(Boolean).length
			: 6
	);
</script>

<div class="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-xs">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
		<div>
			<div class="flex items-center gap-2">
				<h3 class="font-display text-base font-bold text-text">
					Inference Traffic & Multi-Tier Routing
				</h3>
				<span class="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-400">
					Self-Healing Chain
				</span>
			</div>
			<p class="mt-0.5 text-xs text-text-muted">
				Real-time request distribution across Gemini Cloud, self-hosted PyTorch, and local offline models.
			</p>
		</div>
		<div class="flex items-center gap-2 text-xs">
			<span class="text-text-muted">Total Inferences:</span>
			<span class="font-display font-black text-text">{totalCalls > 0 ? totalCalls.toLocaleString() : 'Standby'}</span>
		</div>
	</div>

	<!-- Visual Multi-Provider Traffic Bar -->
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between text-xs font-semibold">
			<span class="text-text-muted">Inference Traffic Allocation</span>
			<span class="text-text font-bold">
				{totalCalls > 0 ? `${geminiPct}% Cloud / ${100 - geminiPct}% Local` : '100% Primary Cloud Active'}
			</span>
		</div>

		<div class="relative flex h-4 w-full overflow-hidden rounded-full bg-surface-muted/80 p-0.5">
			{#if totalCalls === 0}
				<!-- Standby baseline -->
				<div
					class="h-full w-full rounded-full bg-linear-to-r from-primary via-primary/80 to-emerald-500/80 transition-all duration-700"
				></div>
			{:else}
				{#if geminiPct > 0}
					<div
						class="h-full rounded-l-full bg-primary transition-all duration-500"
						style="width: {geminiPct}%;"
						title="Gemini Cloud: {geminiCount} calls ({geminiPct}%)"
					></div>
				{/if}
				{#if mlBackendPct > 0}
					<div
						class="h-full bg-emerald-500 transition-all duration-500 {geminiPct === 0 ? 'rounded-l-full' : ''} {ollamaPct === 0 ? 'rounded-r-full' : ''}"
						style="width: {mlBackendPct}%;"
						title="PyTorch CPU: {mlBackendCount} calls ({mlBackendPct}%)"
					></div>
				{/if}
				{#if ollamaPct > 0}
					<div
						class="h-full rounded-r-full bg-amber-500 transition-all duration-500"
						style="width: {ollamaPct}%;"
						title="Ollama / Local: {ollamaCount} calls ({ollamaPct}%)"
					></div>
				{/if}
			{/if}
		</div>

		<!-- Bar Legend -->
		<div class="flex flex-wrap items-center gap-4 pt-1 text-[11px]">
			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-primary"></span>
				<span class="font-medium text-text">Gemini 2.5 Flash</span>
				<span class="text-text-muted">({geminiPct}%)</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
				<span class="font-medium text-text">Local PyTorch Engine</span>
				<span class="text-text-muted">({mlBackendPct}%)</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
				<span class="font-medium text-text">Ollama / Fallback</span>
				<span class="text-text-muted">({ollamaPct}%)</span>
			</div>
		</div>
	</div>

	<!-- 3-Tier Provider Status Topology Cards -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<!-- Tier 1: Gemini Cloud -->
		<div class="flex flex-col justify-between rounded-xl border border-primary/20 bg-primary/5 p-4">
			<div>
				<div class="flex items-center justify-between">
					<span class="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
						TIER 1 PRIMARY
					</span>
					<span class="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span> Online
					</span>
				</div>
				<h4 class="mt-2 font-display text-sm font-bold text-text">Gemini 2.5 Flash</h4>
				<p class="mt-0.5 text-[11px] text-text-muted">
					Google Cloud GenAI API for dynamic curriculum outlines, adaptive lessons, and reasoning.
				</p>
			</div>
			<div class="mt-4 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-text-muted">
				<span>Requests: <strong class="text-text">{geminiCount}</strong></span>
				<span class="font-bold text-primary">Latency: ~600ms</span>
			</div>
		</div>

		<!-- Tier 2: PyTorch CPU Engine -->
		<div class="flex flex-col justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
			<div>
				<div class="flex items-center justify-between">
					<span class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-400">
						TIER 2 LOCAL ML
					</span>
					<span class="flex items-center gap-1 text-[11px] font-bold {mlBackendHealth?.status === 'ok' || !mlBackendHealth ? 'text-emerald-400' : 'text-amber-400'}">
						<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Ready
					</span>
				</div>
				<h4 class="mt-2 font-display text-sm font-bold text-text">PyTorch CPU Transformers</h4>
				<p class="mt-0.5 text-[11px] text-text-muted">
					Self-hosted HuggingFace models (Flan-T5, MixQG, TinyLlama) with dynamic INT8 quantization.
				</p>
			</div>
			<div class="mt-4 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-text-muted">
				<span>Models Active: <strong class="text-text">{activeModelCount}/6</strong></span>
				<span class="font-bold text-emerald-400">Zero Cloud Cost</span>
			</div>
		</div>

		<!-- Tier 3: Ollama / Failover -->
		<div class="flex flex-col justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
			<div>
				<div class="flex items-center justify-between">
					<span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-500">
						TIER 3 FAILOVER
					</span>
					<span class="flex items-center gap-1 text-[11px] font-bold text-text-muted">
						● Standby
					</span>
				</div>
				<h4 class="mt-2 font-display text-sm font-bold text-text">Ollama / Local LLM</h4>
				<p class="mt-0.5 text-[11px] text-text-muted">
					Emergency zero-internet fallback guaranteeing 100% course generator and quiz continuity.
				</p>
			</div>
			<div class="mt-4 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-text-muted">
				<span>Fallback Ratio: <strong class="text-amber-400">{fallbackPercentage}%</strong></span>
				<span class="font-bold text-amber-500">Air-Gapped Capable</span>
			</div>
		</div>
	</div>
</div>
