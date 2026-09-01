<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	interface AnalyticsData {
		coursesGenerated: number;
		completionRate: number;
		averageQuizAccuracy: number;
		flaggedContentCount: number;
		fallbackFrequency: {
			geminiCount: number;
			mlBackendCount: number;
			fallbackPercentage: number;
		};
		mlBackendHealth?: {
			status: string;
			models_loaded: Record<string, boolean>;
			inference_busy: boolean;
		} | null;
	}

	let analytics = $state<AnalyticsData | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');

	const getModelStatus = (key: string) => {
		if (!analytics?.mlBackendHealth) return 'Standby';
		return analytics.mlBackendHealth.models_loaded[key] ? 'Ready' : 'Loading';
	};

	$effect(() => {
		if (authStore.user) {
			fetchAnalytics();
		}
	});

	const fetchAnalytics = async () => {
		loading = true;
		errorMsg = '';
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/admin/analytics', {
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Access restricted to administrators.');
			}

			analytics = data.analytics;
		} catch (err) {
			console.error('Admin analytics error:', err);
			errorMsg = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			loading = false;
		}
	};
</script>

<svelte:head>
	<title>Admin Dashboard &mdash; AI Study Buddy</title>
</svelte:head>

<div class="gap-8 flex w-full flex-col">
	<div>
		<div
			class="mb-2 gap-1.5 px-3 py-1 text-xs font-bold inline-flex items-center rounded-full border border-primary/30 bg-primary-soft/60 text-primary"
		>
			🛡️ Admin Control Panel
		</div>
		<h1 class="font-display text-2xl font-bold sm:text-3xl text-text">System Analytics & Health</h1>
		<p class="mt-1 text-xs sm:text-sm text-text-muted">
			Real-time aggregate platform metrics, course completions, content flags, and AI provider
			fallback stats.
		</p>
	</div>

	{#if loading}
		<div class="gap-6 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div class="rounded-2xl p-8 shadow-xs border border-danger/20 bg-danger-soft text-center">
			<div class="mb-2 text-3xl">🔒</div>
			<h2 class="font-display text-base font-bold text-danger">Access Restricted</h2>
			<p class="mt-1 text-xs text-danger/80">{errorMsg}</p>
		</div>
	{:else if analytics}
		<!-- Simple Metric Cards Grid -->
		<div class="gap-6 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
			<!-- Metric 1: Courses Generated -->
			<div class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
					>Courses Generated</span
				>
				<div class="font-display text-3xl font-black text-text">{analytics.coursesGenerated}</div>
				<span class="font-semibold text-emerald-500 text-[11px]">Total active courses created</span>
			</div>

			<!-- Metric 2: Completion Rate -->
			<div class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
					>Avg Completion Rate</span
				>
				<div class="font-display text-3xl font-black text-primary">{analytics.completionRate}%</div>
				<span class="font-semibold text-[11px] text-text-muted">Modules fully completed</span>
			</div>

			<!-- Metric 3: Quiz Accuracy -->
			<div class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase">Quiz Accuracy</span
				>
				<div class="font-display text-3xl font-black text-emerald-500">
					{analytics.averageQuizAccuracy}%
				</div>
				<span class="font-semibold text-[11px] text-text-muted">Average score across quizzes</span>
			</div>

			<!-- Metric 4: Flagged Content -->
			<div class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase">Flagged Items</span
				>
				<div class="font-display text-3xl font-black text-amber-500">
					{analytics.flaggedContentCount}
				</div>
				<span class="font-semibold text-[11px] text-text-muted">Content flagged for review</span>
			</div>
		</div>

		<!-- ML Backend Health & RAG Index Panel -->
		<div class="gap-4 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
			<div class="flex items-center justify-between">
				<h3 class="font-display text-base font-bold text-text">
					Self-Hosted ML Backend Status & RAG Vector Store
				</h3>
				<span class="bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400 rounded-full">
					✓ Active Circuit Breaker
				</span>
			</div>

			<div class="gap-4 sm:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
				<div class="gap-1 p-4 flex flex-col rounded-xl border border-border/60 bg-surface-muted/30">
					<span class="font-bold text-[11px] text-text-muted uppercase">RAG Vector Store Index</span
					>
					<span class="font-display text-2xl font-black text-primary">
						{analytics.mlBackendHealth?.models_loaded?.rag_index ? 'Active' : 'Standby'}
					</span>
					<span class="font-medium text-[10px] text-text-muted"
						>{analytics.mlBackendHealth?.models_loaded?.rag_index
							? 'Documents indexed'
							: 'No active index'}</span
					>
				</div>

				<div class="gap-1 p-4 flex flex-col rounded-xl border border-border/60 bg-surface-muted/30">
					<span class="font-bold text-[11px] text-text-muted uppercase">Inference Hardware</span>
					<span class="font-display text-xl font-bold text-text">PyTorch CPU</span>
					<span class="font-medium text-[10px] text-text-muted"
						>Dynamic INT8 Quantization Active</span
					>
				</div>

				<div class="gap-1 p-4 flex flex-col rounded-xl border border-border/60 bg-surface-muted/30">
					<span class="font-bold text-[11px] text-text-muted uppercase">Circuit Breaker</span>
					<span
						class="font-display text-xl font-bold {analytics.mlBackendHealth
							? 'text-emerald-400'
							: 'text-amber-400'}"
					>
						{analytics.mlBackendHealth ? 'CLOSED (Normal)' : 'OPEN / Standby'}
					</span>
					<span class="font-medium text-[10px] text-text-muted">3-Tier Fallback Ready</span>
				</div>
			</div>

			<div class="gap-3 pt-2 sm:grid-cols-3 md:grid-cols-6 grid grid-cols-2">
				{#each [{ name: 'Summarizer', id: 'flan-t5-base', key: 'summarizer' }, { name: 'Paraphraser', id: 'flan-t5-base', key: 'paraphraser' }, { name: 'Outline Gen', id: 'flan-t5-large', key: 'outline_generator' }, { name: 'Lesson Gen', id: 'flan-t5-large', key: 'lesson_generator' }, { name: 'Quiz Pipeline', id: 'mixqg-base', key: 'quiz_pipeline' }, { name: 'AI Chat', id: 'TinyLlama-1.1B', key: 'chat_assistant' }] as m (m.name)}
					{@const status = getModelStatus(m.key)}
					<div
						class="gap-1 p-3 flex flex-col rounded-xl border border-border/50 bg-surface text-center"
					>
						<span class="font-bold text-[11px] text-text">{m.name}</span>
						<span class="font-mono text-[9px] text-text-muted">{m.id}</span>
						<span
							class="mt-1 py-0.5 font-bold rounded-full text-[10px] {status === 'Ready'
								? 'bg-emerald-500/15 text-emerald-400'
								: 'bg-amber-500/15 text-amber-400'}"
						>
							● {status}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
