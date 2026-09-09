<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiFetch } from '$lib/api/client';
	import AccuracyGauge from '$lib/components/charts/AccuracyGauge.svelte';
	import ActivitySparkline from '$lib/components/charts/ActivitySparkline.svelte';
	import PerformanceDonut from '$lib/components/charts/PerformanceDonut.svelte';
	import ConceptBars from '$lib/components/charts/ConceptBars.svelte';
	import RetentionForecastChart from '$lib/components/charts/RetentionForecastChart.svelte';
	import StudyRhythmChart from '$lib/components/charts/StudyRhythmChart.svelte';
	import type {
		UserLearningProfile,
		ConceptMasteryAggregate
	} from '$lib/server/analytics/profileAggregator';
	import type { LearningEvent } from '$lib/server/analytics/learningEvents';
	import {
		TrendingUp,
		Sparkles,
		RefreshCw,
		Target,
		AlertTriangle,
		Clock,
		BrainCircuit,
		ArrowRight,
		Award,
		Zap
	} from '@lucide/svelte';

	let loading = $state(true);
	let error = $state('');
	let timeRange = $state<'7d' | '30d' | 'all'>('30d');
	let demoMode = $state(false);

	let profile = $state<UserLearningProfile | null>(null);
	let events = $state<LearningEvent[]>([]);

	// Demo sample data if a student has no history yet
	const sampleConcepts: Record<string, ConceptMasteryAggregate> = {
		c_py_syntax: {
			conceptId: 'c_py_syntax',
			conceptTag: 'Python Variables & Types',
			totalAttempts: 14,
			correctCount: 13,
			accuracy: 93,
			isWeak: false,
			lastAttemptAt: new Date(Date.now() - 3600000).toISOString()
		},
		c_py_loops: {
			conceptId: 'c_py_loops',
			conceptTag: 'For & While Loops',
			totalAttempts: 12,
			correctCount: 10,
			accuracy: 83,
			isWeak: false,
			lastAttemptAt: new Date(Date.now() - 86400000).toISOString()
		},
		c_py_functions: {
			conceptId: 'c_py_functions',
			conceptTag: 'Function Arguments & Returns',
			totalAttempts: 16,
			correctCount: 12,
			accuracy: 75,
			isWeak: false,
			lastAttemptAt: new Date(Date.now() - 172800000).toISOString()
		},
		c_py_recursion: {
			conceptId: 'c_py_recursion',
			conceptTag: 'Recursive Functions',
			totalAttempts: 9,
			correctCount: 4,
			accuracy: 44,
			isWeak: true,
			lastAttemptAt: new Date(Date.now() - 86400000 * 2).toISOString()
		},
		c_py_oop: {
			conceptId: 'c_py_oop',
			conceptTag: 'Classes & Inheritance',
			totalAttempts: 11,
			correctCount: 6,
			accuracy: 55,
			isWeak: true,
			lastAttemptAt: new Date(Date.now() - 86400000 * 3).toISOString()
		},
		c_py_complexity: {
			conceptId: 'c_py_complexity',
			conceptTag: 'Big-O Time Complexity',
			totalAttempts: 8,
			correctCount: 7,
			accuracy: 88,
			isWeak: false,
			lastAttemptAt: new Date(Date.now() - 86400000 * 4).toISOString()
		}
	};

	async function fetchAnalytics() {
		if (!authStore.user) return;
		loading = true;
		error = '';

		try {
			const res = await apiFetch<{
				profile: UserLearningProfile;
				recentEvents: LearningEvent[];
			}>('/api/analytics/events?limit=250');

			if (res.ok && res.data) {
				profile = res.data.profile;
				events = res.data.recentEvents || [];
			} else {
				error = 'Failed to load performance analytics.';
			}
		} catch (e: unknown) {
			console.error('[progress] Error fetching analytics:', e);
			error = 'Unable to fetch learning stats. Please check your connection.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (authStore.authResolved) {
			fetchAnalytics();
		}
	});

	$effect(() => {
		if (authStore.authResolved && authStore.user && !profile && !loading && !error) {
			fetchAnalytics();
		}
	});

	// Active concepts source: user profile or demo data
	let activeConcepts = $derived.by(() => {
		if (demoMode) return sampleConcepts;
		const mastery = profile?.conceptsMastery || {};
		// If profile has concepts, return them
		if (Object.keys(mastery).length > 0) return mastery;

		// Dynamically derive from recent events if session aggregation hasn't run yet
		const derived: Record<string, ConceptMasteryAggregate> = {};
		for (const ev of events) {
			if (ev.conceptId && ev.result) {
				const tag = ev.metadata?.sourceLabel || ev.conceptId;
				const existing = derived[ev.conceptId] || {
					conceptId: ev.conceptId,
					conceptTag: tag,
					totalAttempts: 0,
					correctCount: 0,
					accuracy: 0,
					isWeak: false,
					lastAttemptAt: ev.timestamp
				};
				existing.totalAttempts += 1;
				if (ev.result === 'correct') existing.correctCount += 1;
				existing.accuracy = Math.round((existing.correctCount / existing.totalAttempts) * 100);
				existing.isWeak = existing.accuracy < 70 && existing.totalAttempts >= 2;
				derived[ev.conceptId] = existing;
			}
		}
		return derived;
	});

	// Filter events by time range
	let filteredEvents = $derived.by(() => {
		if (demoMode) return [];
		if (timeRange === 'all') return events;

		const days = timeRange === '7d' ? 7 : 30;
		const cutoff = Date.now() - days * 86400000;
		return events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
	});

	// Aggregated answers breakdown
	let performanceSummary = $derived.by(() => {
		if (demoMode) {
			return { correct: 52, incorrect: 18, skipped: 5, total: 75, accuracy: 74 };
		}

		let correct = 0;
		let incorrect = 0;
		let skipped = 0;

		const sourceEvents = timeRange === 'all' ? events : filteredEvents;

		for (const ev of sourceEvents) {
			if (ev.result === 'correct') correct++;
			else if (ev.result === 'incorrect') incorrect++;
			else if (ev.result === 'skipped') skipped++;
		}

		const total = correct + incorrect + skipped;
		// Fallback to concepts accuracy if events don't have individual question rows
		let accuracy = 0;
		if (total > 0) {
			accuracy = Math.round((correct / total) * 100);
		} else {
			const concepts = Object.values(activeConcepts);
			if (concepts.length > 0) {
				const sum = concepts.reduce((acc, c) => acc + c.accuracy, 0);
				accuracy = Math.round(sum / concepts.length);
			}
		}

		return { correct, incorrect, skipped, total, accuracy };
	});

	// Daily activity points for the sparkline chart
	let dailyActivityPoints = $derived.by(() => {
		const daysCount = timeRange === '7d' ? 7 : 30;
		const points: {
			date: string;
			label: string;
			count: number;
			correct: number;
			incorrect: number;
			accuracy: number;
		}[] = [];

		const now = new Date();

		if (demoMode) {
			// Realistic sample wave
			for (let i = daysCount - 1; i >= 0; i--) {
				const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
				const dateStr = d.toISOString().split('T')[0];
				const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
				// Pseudo-random but smooth pattern
				const pseudoCount = Math.max(0, Math.round(Math.sin(i * 0.6) * 4 + 5));
				const correct = Math.round(pseudoCount * 0.75);
				const incorrect = pseudoCount - correct;
				const accuracy = pseudoCount > 0 ? Math.round((correct / pseudoCount) * 100) : 0;
				points.push({ date: dateStr, label, count: pseudoCount, correct, incorrect, accuracy });
			}
			return points;
		}

		// Group real events by local date
		const dayMap: Record<string, { count: number; correct: number; incorrect: number }> = {};
		for (let i = daysCount - 1; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			dayMap[dateStr] = { count: 0, correct: 0, incorrect: 0 };
		}

		for (const ev of events) {
			if (!ev.timestamp) continue;
			const d = new Date(ev.timestamp);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			if (dayMap[dateStr]) {
				dayMap[dateStr].count += 1;
				if (ev.result === 'correct') dayMap[dateStr].correct += 1;
				if (ev.result === 'incorrect') dayMap[dateStr].incorrect += 1;
			}
		}

		for (let i = daysCount - 1; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			const dayData = dayMap[dateStr] || { count: 0, correct: 0, incorrect: 0 };
			const acc = dayData.count > 0 ? Math.round((dayData.correct / dayData.count) * 100) : 0;
			points.push({
				date: dateStr,
				label,
				count: dayData.count,
				correct: dayData.correct,
				incorrect: dayData.incorrect,
				accuracy: acc
			});
		}

		return points;
	});

	// Strengths and weaknesses counts
	let strengthsCount = $derived(
		Object.values(activeConcepts).filter((c) => c.accuracy >= 70).length
	);
	let weakConceptsList = $derived(
		Object.values(activeConcepts).filter((c) => c.isWeak || c.accuracy < 70)
	);
	let weakConceptsCount = $derived(weakConceptsList.length);

	let weeklyRhythm = $derived.by(() => {
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const counts: Record<string, { minutes: number; questions: number }> = {
			Mon: { minutes: 0, questions: 0 },
			Tue: { minutes: 0, questions: 0 },
			Wed: { minutes: 0, questions: 0 },
			Thu: { minutes: 0, questions: 0 },
			Fri: { minutes: 0, questions: 0 },
			Sat: { minutes: 0, questions: 0 },
			Sun: { minutes: 0, questions: 0 }
		};

		let morning = 0;
		let afternoon = 0;
		let evening = 0;

		if (events.length === 0 || demoMode) {
			return {
				weekData: [
					{ day: 'Mon', fullName: 'Monday', minutes: 35, questions: 14 },
					{ day: 'Tue', fullName: 'Tuesday', minutes: 45, questions: 18 },
					{ day: 'Wed', fullName: 'Wednesday', minutes: 20, questions: 8 },
					{ day: 'Thu', fullName: 'Thursday', minutes: 55, questions: 22 },
					{ day: 'Fri', fullName: 'Friday', minutes: 40, questions: 16 },
					{ day: 'Sat', fullName: 'Saturday', minutes: 60, questions: 25 },
					{ day: 'Sun', fullName: 'Sunday', minutes: 30, questions: 12 }
				],
				peakTime: 'Evening (7:00 PM - 10:00 PM)',
				morningPct: 25,
				afternoonPct: 35,
				eveningPct: 40
			};
		}

		for (const ev of events) {
			if (!ev.timestamp) continue;
			const d = new Date(ev.timestamp);
			const dayName = days[d.getDay()];
			if (counts[dayName]) {
				counts[dayName].questions += 1;
				counts[dayName].minutes += 3;
			}
			const hour = d.getHours();
			if (hour >= 6 && hour < 12) morning++;
			else if (hour >= 12 && hour < 18) afternoon++;
			else evening++;
		}

		const totalTimeEvs = morning + afternoon + evening || 1;
		const morningPct = Math.round((morning / totalTimeEvs) * 100);
		const afternoonPct = Math.round((afternoon / totalTimeEvs) * 100);
		const eveningPct = Math.max(0, 100 - morningPct - afternoonPct);

		let peakTime = 'Evening (7:00 PM - 10:00 PM)';
		if (morning > afternoon && morning > evening) peakTime = 'Morning (8:00 AM - 11:30 AM)';
		else if (afternoon > morning && afternoon > evening) peakTime = 'Afternoon (1:00 PM - 4:30 PM)';

		const weekData = [
			{ day: 'Mon', fullName: 'Monday', minutes: Math.max(10, Math.round(counts['Mon'].minutes)), questions: counts['Mon'].questions },
			{ day: 'Tue', fullName: 'Tuesday', minutes: Math.max(10, Math.round(counts['Tue'].minutes)), questions: counts['Tue'].questions },
			{ day: 'Wed', fullName: 'Wednesday', minutes: Math.max(10, Math.round(counts['Wed'].minutes)), questions: counts['Wed'].questions },
			{ day: 'Thu', fullName: 'Thursday', minutes: Math.max(10, Math.round(counts['Thu'].minutes)), questions: counts['Thu'].questions },
			{ day: 'Fri', fullName: 'Friday', minutes: Math.max(10, Math.round(counts['Fri'].minutes)), questions: counts['Fri'].questions },
			{ day: 'Sat', fullName: 'Saturday', minutes: Math.max(10, Math.round(counts['Sat'].minutes)), questions: counts['Sat'].questions },
			{ day: 'Sun', fullName: 'Sunday', minutes: Math.max(10, Math.round(counts['Sun'].minutes)), questions: counts['Sun'].questions }
		];

		return { weekData, peakTime, morningPct, afternoonPct, eveningPct };
	});

	// Top weakness recommendation
	let topWeakness = $derived.by(() => {
		if (weakConceptsList.length === 0) return null;
		// Return the one with lowest accuracy and at least 1 attempt
		return [...weakConceptsList].sort((a, b) => a.accuracy - b.accuracy)[0];
	});

	let formattedStudyTime = $derived.by(() => {
		const totalMs = profile?.totalStudyTimeMs || (demoMode ? 14400000 : 0);
		const totalMins = Math.round(totalMs / 60000);
		if (totalMins < 60) return `${totalMins}m`;
		const hours = Math.floor(totalMins / 60);
		const mins = totalMins % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	});

	let hasAnyData = $derived(
		demoMode ||
			performanceSummary.total > 0 ||
			Object.keys(activeConcepts).length > 0 ||
			events.length > 0
	);
</script>

<svelte:head>
	<title>Performance & Analytics | AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-2.5">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"
				>
					<TrendingUp class="h-5 w-5" aria-hidden="true" />
				</div>
				<h1 class="font-display text-xl font-black tracking-tight text-text sm:text-2xl">
					My Performance & Mastery
				</h1>
			</div>
			<p class="mt-1 text-xs text-text-muted sm:text-sm">
				Monitor your subject strengths, pinpoint growth areas, and track quiz accuracy over time.
			</p>
		</div>

		<!-- Time Range Segmented Control & Refresh -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- Time Range Pills -->
			<div class="flex items-center rounded-xl border border-border bg-surface p-1 shadow-2xs">
				<button
					type="button"
					onclick={() => (timeRange = '7d')}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition-all {timeRange ===
					'7d'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
				>
					7 Days
				</button>
				<button
					type="button"
					onclick={() => (timeRange = '30d')}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition-all {timeRange ===
					'30d'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
				>
					30 Days
				</button>
				<button
					type="button"
					onclick={() => (timeRange = 'all')}
					class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold transition-all {timeRange ===
					'all'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
				>
					All Time
				</button>
			</div>

			<!-- Refresh Button -->
			<button
				type="button"
				onclick={fetchAnalytics}
				disabled={loading}
				aria-label="Refresh performance statistics"
				class="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-surface p-2 text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-50"
			>
				<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
			</button>
		</div>
	</div>

	<!-- Demo Banner if toggled or if user has no data yet -->
	{#if !hasAnyData && !loading}
		<div
			class="flex flex-col items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 sm:flex-row sm:p-5"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white"
				>
					<Sparkles class="h-5 w-5" />
				</div>
				<div>
					<h3 class="font-display text-sm font-bold text-text">No study data recorded yet</h3>
					<p class="text-xs text-text-muted">
						Complete interactive lessons and quizzes to build your real-time performance profile.
					</p>
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onclick={() => (demoMode = !demoMode)}
					class="cursor-pointer rounded-xl border border-primary/40 bg-surface px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft"
				>
					{demoMode ? 'Exit Sample Preview' : 'Preview with Sample Data'}
				</button>
				<a
					href="/app/review"
					class="cursor-pointer rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover"
				>
					Start Practice Quiz
				</a>
			</div>
		</div>
	{:else if demoMode}
		<div
			class="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-500"
		>
			<span>Showing simulated sample analytics preview. Answer quizzes to see live stats.</span>
			<button
				type="button"
				onclick={() => (demoMode = false)}
				class="cursor-pointer font-bold underline hover:text-amber-400"
			>
				Return to Live Data
			</button>
		</div>
	{/if}

	<!-- Top 4 KPI Stat Cards -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
		<!-- 1. Accuracy -->
		<div
			class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold text-text-muted">Pass Rate</span>
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"
				>
					<Target class="h-4 w-4" />
				</div>
			</div>
			<div class="mt-3">
				<div class="flex items-baseline gap-1">
					<span class="font-display text-2xl font-black text-text sm:text-3xl">
						{performanceSummary.accuracy}
					</span>
					<span class="text-sm font-bold text-text-muted">%</span>
				</div>
				<p class="mt-0.5 text-[11px] font-medium text-emerald-500">
					{performanceSummary.correct} correct of {performanceSummary.total}
				</p>
			</div>
		</div>

		<!-- 2. Mastered Strengths -->
		<div
			class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold text-text-muted">Strengths</span>
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Award class="h-4 w-4" />
				</div>
			</div>
			<div class="mt-3">
				<div class="flex items-baseline gap-1">
					<span class="font-display text-2xl font-black text-text sm:text-3xl">
						{strengthsCount}
					</span>
					<span class="text-xs font-bold text-text-muted">topics</span>
				</div>
				<p class="mt-0.5 text-[11px] font-medium text-primary">≥70% mastery achieved</p>
			</div>
		</div>

		<!-- 3. Needs Focus / Weaknesses -->
		<div
			class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold text-text-muted">Growth Areas</span>
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500"
				>
					<AlertTriangle class="h-4 w-4" />
				</div>
			</div>
			<div class="mt-3">
				<div class="flex items-baseline gap-1">
					<span class="font-display text-2xl font-black text-text sm:text-3xl">
						{weakConceptsCount}
					</span>
					<span class="text-xs font-bold text-text-muted">topics</span>
				</div>
				<p class="mt-0.5 text-[11px] font-medium text-rose-500">
					{weakConceptsCount > 0 ? 'Actionable review ready' : 'No weak spots!'}
				</p>
			</div>
		</div>

		<!-- 4. Practice Time & Sessions -->
		<div
			class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-xs"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs font-semibold text-text-muted">Study Time</span>
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500"
				>
					<Clock class="h-4 w-4" />
				</div>
			</div>
			<div class="mt-3">
				<div class="flex items-baseline gap-1">
					<span class="font-display text-2xl font-black text-text sm:text-3xl">
						{formattedStudyTime}
					</span>
				</div>
				<p class="mt-0.5 text-[11px] font-medium text-text-muted">
					{profile?.sessionCount || (demoMode ? 12 : 0)} completed sessions
				</p>
			</div>
		</div>
	</div>

	<!-- Smart Recommendation Callout -->
	{#if topWeakness}
		<div
			class="flex flex-col items-start justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 font-bold text-slate-950"
				>
					<Zap class="h-5 w-5" />
				</div>
				<div>
					<div class="flex items-center gap-2">
						<span class="text-[10px] font-bold tracking-wider text-amber-500 uppercase">
							Targeted Recommendation
						</span>
						<span
							class="py-0.2 rounded bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
						>
							{topWeakness.accuracy}% Accuracy
						</span>
					</div>
					<h4 class="mt-0.5 font-display text-sm font-bold text-text">
						Reinforce "{topWeakness.conceptTag || topWeakness.conceptId}"
					</h4>
					<p class="text-xs text-text-muted">
						You missed questions in this concept. Drill your recorded errors in Mistake Bank to turn
						this into a strength.
					</p>
				</div>
			</div>

			<a
				href="/app/mistakes"
				class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-400"
			>
				<span>Open Mistake Bank</span>
				<ArrowRight class="h-4 w-4" />
			</a>
		</div>
	{/if}

	<!-- Main Analytics Grid -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Left 2 Cols: Activity Trend & Concept Mastery Bars -->
		<div class="flex flex-col gap-6 lg:col-span-2">
			<!-- Daily Activity & Accuracy Trend Chart -->
			<ActivitySparkline
				points={dailyActivityPoints}
				title={timeRange === '7d'
					? 'Past 7 Days Practice Momentum'
					: timeRange === '30d'
						? 'Past 30 Days Practice Momentum'
						: 'All-Time Practice Activity'}
			/>

			<!-- Spaced Repetition Memory & Retention Forecast Chart -->
			<RetentionForecastChart
				currentRetention={performanceSummary.accuracy || (demoMode ? 88 : 85)}
				stabilityDays={timeRange === '7d' ? 8 : 14}
			/>

			<!-- Detailed Concept Mastery Bars (Strengths vs Weaknesses) -->
			<ConceptBars concepts={activeConcepts} />
		</div>

		<!-- Right 1 Col: Gauge, Rhythm, Outcome Donut, and Quick Actions -->
		<div class="flex flex-col gap-6">
			<!-- Overall Accuracy Gauge Card -->
			<div class="flex flex-col rounded-2xl border border-border bg-surface shadow-xs">
				<AccuracyGauge
					accuracy={performanceSummary.accuracy}
					totalAnswered={performanceSummary.total}
					label="Mastery Index"
				/>
			</div>

			<!-- Weekly Study Rhythm & Peak Hours Chart -->
			<StudyRhythmChart
				weekData={weeklyRhythm.weekData}
				peakTime={weeklyRhythm.peakTime}
				morningPct={weeklyRhythm.morningPct}
				afternoonPct={weeklyRhythm.afternoonPct}
				eveningPct={weeklyRhythm.eveningPct}
			/>

			<!-- Performance Donut Breakdown -->
			<PerformanceDonut
				correct={performanceSummary.correct}
				incorrect={performanceSummary.incorrect}
				skipped={performanceSummary.skipped}
			/>

			<!-- Quick Drill Action Card -->
			<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs">
				<h4 class="font-display text-xs font-bold tracking-wider text-text uppercase">
					Next Learning Steps
				</h4>
				<div class="flex flex-col gap-2">
					<a
						href="/app/review"
						class="flex items-center justify-between rounded-xl border border-border bg-bg p-3 transition-colors hover:border-primary/50 hover:bg-surface-muted"
					>
						<div class="flex items-center gap-2.5">
							<BrainCircuit class="h-4 w-4 text-primary" />
							<div>
								<span class="block text-xs font-bold text-text">Spaced Review</span>
								<span class="block text-[10px] text-text-muted">Review due flashcards</span>
							</div>
						</div>
						<ArrowRight class="h-4 w-4 text-text-muted" />
					</a>

					<a
						href="/app/mistakes"
						class="flex items-center justify-between rounded-xl border border-border bg-bg p-3 transition-colors hover:border-rose-500/50 hover:bg-surface-muted"
					>
						<div class="flex items-center gap-2.5">
							<AlertTriangle class="h-4 w-4 text-rose-500" />
							<div>
								<span class="block text-xs font-bold text-text">Mistake Bank</span>
								<span class="block text-[10px] text-text-muted">Retest missed quiz questions</span>
							</div>
						</div>
						<ArrowRight class="h-4 w-4 text-text-muted" />
					</a>
				</div>
			</div>
		</div>
	</div>
</div>
