<script lang="ts">
	import { apiFetch } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Role } from '$lib/rbac';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PlatformFunnelChart from '$lib/components/charts/PlatformFunnelChart.svelte';
	import DomainDistributionChart from '$lib/components/charts/DomainDistributionChart.svelte';
	import InferenceTelemetryChart from '$lib/components/charts/InferenceTelemetryChart.svelte';

	interface StudentStats {
		totalUsers: number;
		totalStudents: number;
		totalAdmins: number;
		totalSuperAdmins: number;
		bannedStudents: number;
		activeStudents30d: number;
		activeStudents7d: number;
		cohortMasteryDistribution: {
			mastery: number;
			proficient: number;
			developing: number;
			needsFocus: number;
		};
	}

	interface WeakConceptHotspot {
		conceptId: string;
		tag: string;
		totalAttempts: number;
		errorRate: number;
		accuracy: number;
	}

	interface DailyActivity {
		date: string;
		attempts: number;
		averageAccuracy: number;
	}

	interface AnalyticsData {
		coursesGenerated: number;
		completionRate: number;
		averageQuizAccuracy: number;
		flaggedContentCount: number;
		fallbackFrequency: {
			geminiCount: number;
			mlBackendCount: number;
			ollamaCount?: number;
			fallbackPercentage: number;
		};
		mlBackendHealth?: {
			status: string;
			models_loaded: Record<string, boolean>;
			inference_busy: boolean;
		} | null;
		studentStats?: StudentStats;
		weakConceptHotspots?: WeakConceptHotspot[];
		dailyActivity?: DailyActivity[];
		domainDistribution?: Array<{ domain: string; count: number; percentage: number }>;
		learningFunnel?: Array<{ stage: string; count: number; description?: string }>;
	}

	interface StudentItem {
		uid: string;
		email: string;
		displayName: string | null;
		photoURL: string | null;
		role: 'student' | 'instructor' | 'admin' | 'superadmin';
		isBanned: boolean;
		bannedReason: string | null;
		createdAt: string;
		streakCurrent: number;
		streakLongest: number;
		courseCount: number;
		averageAccuracy: number;
		quizzesTaken: number;
		lastActive: string;
	}

	interface StudentDossier {
		uid: string;
		email: string;
		displayName: string | null;
		photoURL: string | null;
		role: string;
		isBanned: boolean;
		bannedReason: string | null;
		createdAt: string;
		streak: { current: number; longest: number; lastStudiedOn: string | null };
		courses: Array<{
			id: string;
			title: string;
			moduleCount: number;
			completedCount: number;
			createdAt: string;
		}>;
		learningProfile: {
			totalStudyTimeMs: number;
			sessionCount: number;
			weakConcepts: string[];
			conceptsMastery: Record<
				string,
				{ conceptTag: string; accuracy: number; totalAttempts: number; isWeak: boolean }
			>;
			recentActivity: Array<{
				sessionId: string;
				eventType: string;
				timestamp: string;
				summaryText: string;
			}>;
		};
		recentQuizzes: Array<{
			id: string;
			courseId: string;
			accuracy: number;
			score: number;
			totalQuestions: number;
			timestamp: string;
		}>;
	}

	let activeTab = $state<'overview' | 'students' | 'system'>('overview');

	// Analytics state
	let analytics = $state<AnalyticsData | null>(null);
	let loadingAnalytics = $state(true);
	let analyticsError = $state('');

	// Students list state
	let students = $state<StudentItem[]>([]);
	let loadingStudents = $state(false);
	let searchQuery = $state('');
	let roleFilter = $state('all');
	let statusFilter = $state('all');
	let sortFilter = $state('recent');

	// Selected student dossier modal
	let selectedStudent = $state<StudentDossier | null>(null);
	let loadingDossier = $state(false);
	let dossierError = $state('');

	// Role management modal
	let editingUser = $state<StudentItem | null>(null);
	let targetRole = $state<Role>('student');
	let targetBanned = $state(false);
	let banReason = $state('');
	let savingRole = $state(false);

	let isActorAdmin = $derived(
		Boolean(
			authStore.profile?.role === 'admin' ||
			authStore.profile?.isAdmin === true ||
			authStore.profile?.role === 'superadmin' ||
			authStore.profile?.isSuperAdmin === true
		)
	);

	function setActiveTab(tab: 'overview' | 'students' | 'system') {
		activeTab = tab;
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			if (tab === 'students') {
				url.searchParams.set('tab', 'users');
			} else if (tab === 'system') {
				url.searchParams.set('tab', 'system');
			} else {
				url.searchParams.delete('tab');
			}
			window.history.replaceState({}, '', url.toString());
		}
	}

	$effect(() => {
		const tabParam = page.url.searchParams.get('tab')?.toLowerCase();
		if (tabParam === 'users' || tabParam === 'students' || tabParam === 'roles' || tabParam === 'access') {
			activeTab = 'students';
		} else if (tabParam === 'system') {
			activeTab = 'system';
		} else if (tabParam === 'overview') {
			activeTab = 'overview';
		}

		const inspectUid =
			page.url.searchParams.get('inspect') ||
			page.url.searchParams.get('user') ||
			page.url.searchParams.get('uid');
		if (inspectUid && authStore.authResolved && isActorAdmin) {
			inspectStudent(inspectUid);
		}
	});

	$effect(() => {
		if (authStore.authResolved && isActorAdmin) {
			fetchAnalytics();
			fetchStudents();
		}
	});

	const fetchAnalytics = async () => {
		loadingAnalytics = true;
		analyticsError = '';
		try {
			const { data } = await apiFetch<{ analytics: AnalyticsData }>('/api/admin/analytics');
			analytics = data.analytics;
		} catch (err) {
			console.error('Admin analytics error:', err);
			analyticsError = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			loadingAnalytics = false;
		}
	};

	const fetchStudents = async () => {
		loadingStudents = true;
		try {
			const params = new SvelteURLSearchParams();
			if (searchQuery.trim()) params.set('q', searchQuery.trim());
			if (roleFilter !== 'all') params.set('role', roleFilter);
			if (statusFilter !== 'all') params.set('status', statusFilter);
			if (sortFilter !== 'recent') params.set('sort', sortFilter);

			const queryString = params.toString() ? `?${params.toString()}` : '';
			const { data } = await apiFetch<{ students: StudentItem[] }>(
				`/api/admin/students${queryString}`
			);
			students = data.students || [];
		} catch (err) {
			console.error('Admin fetch students error:', err);
			toastStore.error('Failed to load students roster');
		} finally {
			loadingStudents = false;
		}
	};

	const inspectStudent = async (uid: string) => {
		loadingDossier = true;
		dossierError = '';
		selectedStudent = null;
		try {
			const { data } = await apiFetch<{ student: StudentDossier }>(`/api/admin/students/${uid}`);
			selectedStudent = data.student;
		} catch (err) {
			console.error('Inspect student error:', err);
			dossierError = err instanceof Error ? err.message : 'Could not retrieve student details';
		} finally {
			loadingDossier = false;
		}
	};

	const openRoleModal = (student: StudentItem) => {
		editingUser = student;
		targetRole = student.role;
		targetBanned = student.isBanned;
		banReason = student.bannedReason || '';
	};

	const saveRoleAndStatus = async () => {
		if (!editingUser) return;
		const targetUid = editingUser.uid;
		const displayName = editingUser.displayName || editingUser.email;
		savingRole = true;
		try {
			await apiFetch(`/api/admin/students/${targetUid}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: targetRole,
					isBanned: targetBanned,
					bannedReason: targetBanned ? banReason || 'Account suspended by administrator' : null
				})
			});

			toastStore.success(`Successfully updated student profile for ${displayName}`);
			editingUser = null;
			await fetchStudents();
			if (selectedStudent && selectedStudent.uid === targetUid) {
				await inspectStudent(targetUid);
			}
		} catch (err) {
			console.error('Save role error:', err);
			toastStore.error(err instanceof Error ? err.message : 'Failed to update user');
		} finally {
			savingRole = false;
		}
	};

	const toggleQuickSuspend = async (student: StudentItem) => {
		const newStatus = !student.isBanned;
		const actionWord = newStatus ? 'suspend' : 'reinstate';
		if (
			!confirm(`Are you sure you want to ${actionWord} ${student.displayName || student.email}?`)
		) {
			return;
		}

		try {
			await apiFetch(`/api/admin/students/${student.uid}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					isBanned: newStatus,
					bannedReason: newStatus ? 'Suspended via quick action' : null
				})
			});
			toastStore.success(`Account ${newStatus ? 'suspended' : 'reactivated'} successfully`);
			await fetchStudents();
		} catch (err) {
			console.error('Quick suspend error:', err);
			toastStore.error(err instanceof Error ? err.message : 'Action failed');
		}
	};

	const getModelStatus = (key: string) => {
		if (!analytics?.mlBackendHealth) return 'Standby';
		return analytics.mlBackendHealth.models_loaded?.[key] ? 'Ready' : 'Loading';
	};

	// SVG Activity sparkline calculations
	let activitySvgPath = $derived.by(() => {
		const pts = analytics?.dailyActivity || [];
		if (pts.length < 2) return '';
		const width = 600;
		const height = 140;
		const maxAttempts = Math.max(...pts.map((p) => p.attempts), 5);
		const coords = pts.map((p, i) => {
			const x = (i / (pts.length - 1)) * (width - 40) + 20;
			const y = height - 20 - (p.attempts / maxAttempts) * (height - 40);
			return { x, y };
		});
		let path = `M ${coords[0].x},${coords[0].y}`;
		for (let i = 1; i < coords.length; i++) {
			const prev = coords[i - 1];
			const curr = coords[i];
			const cpx = (prev.x + curr.x) / 2;
			path += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
		}
		return path;
	});

	let activityAreaPath = $derived.by(() => {
		if (!activitySvgPath) return '';
		const width = 600;
		const height = 140;
		const firstX = 20;
		const lastX = width - 20;
		return `${activitySvgPath} L ${lastX},${height - 20} L ${firstX},${height - 20} Z`;
	});
</script>

<svelte:head>
	<title>Platform Oversight & Student Analytics &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex w-full flex-col gap-8 pb-12">
	<!-- Access Control Guard Screen -->
	{#if authStore.authResolved && !isActorAdmin}
		<div
			class="mx-auto my-12 flex max-w-lg flex-col items-center rounded-3xl border border-danger/30 bg-danger/5 p-8 text-center shadow-lg backdrop-blur-md"
		>
			<div
				class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-3xl text-danger shadow-inner"
			>
				🔒
			</div>
			<h2 class="font-display text-2xl font-bold text-text">Administrative Access Restricted</h2>
			<p class="mt-2 text-sm leading-relaxed text-text-muted">
				Your account does not possess the required <strong>Administrator</strong> or
				<strong>Super Administrator</strong> role. All platform oversight and student telemetry functions
				are strictly gated by Role-Based Access Control (RBAC).
			</p>
			<div class="mt-6 flex gap-3">
				<a
					href={resolve('/app')}
					class="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-primary-hover active:scale-98"
				>
					← Return to Student Workspace
				</a>
			</div>
		</div>
	{:else}
		<!-- Executive Top Header -->
		<div
			class="flex flex-col justify-between gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center"
		>
			<div>
				<div
					class="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary"
				>
					<span>🛡️ Admin Command Center</span>
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
					<span class="text-[10px] font-extrabold tracking-wider text-text-muted uppercase"
						>RBAC Active</span
					>
				</div>
				<h1 class="font-display text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
					Platform Oversight & Student Analytics
				</h1>
				<p class="mt-1 text-xs text-text-muted sm:text-sm">
					Monitor student cohorts, inspect learning mastery, manage role-based access, and oversee
					system health.
				</p>
			</div>

			<div class="flex items-center gap-2.5">
				<button
					type="button"
					onclick={() => {
						fetchAnalytics();
						fetchStudents();
					}}
					class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-text-muted shadow-xs transition-colors hover:bg-surface-muted hover:text-text active:scale-98"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					Refresh Metrics
				</button>

				<button
					type="button"
					onclick={() => setActiveTab('students')}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/30 bg-primary-soft px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
				>
					<span>👥 Users & Access Governance</span>
				</button>
			</div>
		</div>

		<!-- Main Interactive Navigation Tabs -->
		<div class="flex items-center gap-2 border-b border-border/60">
			<button
				type="button"
				onclick={() => setActiveTab('overview')}
				class="relative cursor-pointer px-5 py-3 text-xs font-bold transition-colors {activeTab ===
				'overview'
					? 'text-primary'
					: 'text-text-muted hover:text-text'}"
			>
				📊 Cohort & Learning Analytics
				{#if activeTab === 'overview'}
					<span class="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-primary"></span>
				{/if}
			</button>

			<button
				type="button"
				onclick={() => setActiveTab('students')}
				class="relative cursor-pointer px-5 py-3 text-xs font-bold transition-colors {activeTab ===
				'students'
					? 'text-primary'
					: 'text-text-muted hover:text-text'}"
			>
				👥 Users & Access Governance
				{#if activeTab === 'students'}
					<span class="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-primary"></span>
				{/if}
			</button>

			<button
				type="button"
				onclick={() => setActiveTab('system')}
				class="relative cursor-pointer px-5 py-3 text-xs font-bold transition-colors {activeTab ===
				'system'
					? 'text-primary'
					: 'text-text-muted hover:text-text'}"
			>
				⚡ AI & System Infrastructure
				{#if activeTab === 'system'}
					<span class="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-primary"></span>
				{/if}
			</button>
		</div>

		<!-- ================= TAB 1: COHORT & LEARNING ANALYTICS ================= -->
		{#if activeTab === 'overview'}
			{#if loadingAnalytics}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<Skeleton variant="card" />
					<Skeleton variant="card" />
					<Skeleton variant="card" />
					<Skeleton variant="card" />
				</div>
			{:else if analyticsError}
				<div class="rounded-2xl border border-danger/20 bg-danger/5 p-8 text-center text-danger">
					{analyticsError}
				</div>
			{:else if analytics}
				<!-- Top 4 KPI Metrics -->
				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Metric 1: Total Platform Accounts -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs transition-transform hover:-translate-y-0.5"
					>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
								>Platform Accounts</span
							>
							<span class="rounded-lg bg-primary/10 p-2 text-primary">👥</span>
						</div>
						<div class="my-3">
							<div class="font-display text-3xl font-black text-text">
								{analytics.studentStats?.totalUsers ?? (analytics.studentStats?.totalAdmins ? 1 : 0)}
							</div>
							<span class="text-xs font-semibold text-primary">
								{analytics.studentStats?.totalStudents ?? 0} students · {analytics.studentStats?.totalAdmins ?? 1} admin
							</span>
						</div>
						<div class="text-[11px] text-text-muted">
							+{analytics.studentStats?.activeStudents30d ?? 0} active in last 30d
						</div>
					</div>

					<!-- Metric 2: Avg Quiz Accuracy -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs transition-transform hover:-translate-y-0.5"
					>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
								>Cohort Avg Accuracy</span
							>
							<span class="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">🎯</span>
						</div>
						<div class="my-3">
							<div class="font-display text-3xl font-black text-emerald-500">
								{analytics.averageQuizAccuracy}%
							</div>
							<span class="text-xs font-semibold text-text-muted"> Overall quiz retention </span>
						</div>
						<div class="text-[11px] text-text-muted">
							Weighted across all completed quiz attempts
						</div>
					</div>

					<!-- Metric 3: Courses Generated & Completion -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs transition-transform hover:-translate-y-0.5"
					>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
								>Generated Courses</span
							>
							<span class="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">📚</span>
						</div>
						<div class="my-3">
							<div class="font-display text-3xl font-black text-text">
								{analytics.coursesGenerated}
							</div>
							<span class="text-xs font-semibold text-primary">
								{analytics.completionRate}% completion rate
							</span>
						</div>
						<div class="text-[11px] text-text-muted">Full modules finished by students</div>
					</div>

					<!-- Metric 4: Moderation & Flags -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs transition-transform hover:-translate-y-0.5"
					>
						<div class="flex items-center justify-between">
							<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
								>Content Flags</span
							>
							<span class="rounded-lg bg-amber-500/10 p-2 text-amber-500">🚩</span>
						</div>
						<div class="my-3">
							<div
								class="font-display text-3xl font-black {analytics.flaggedContentCount > 0
									? 'text-amber-500'
									: 'text-text'}"
							>
								{analytics.flaggedContentCount}
							</div>
							<span class="text-xs font-semibold text-text-muted"> Items requiring review </span>
						</div>
						<div class="text-[11px] text-text-muted">
							{analytics.studentStats?.bannedStudents ?? 0} suspended accounts
						</div>
					</div>
				</div>

				<!-- Visual Mastery Breakdown & 14-Day Activity Sparkline -->
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<!-- Cohort Mastery Breakdown Card -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs"
					>
						<div>
							<div class="flex items-center justify-between">
								<h3 class="font-display text-base font-bold text-text">
									Cohort Mastery Distribution
								</h3>
								<span class="text-xs font-bold text-primary">Live Tier Breakdown</span>
							</div>
							<p class="mt-1 text-xs text-text-muted">
								Categorization of students based on their aggregate quiz accuracy across all
								curriculum topics.
							</p>

							<div class="mt-6 flex flex-col gap-3.5">
								<!-- Tier 1: Mastery (>=85%) -->
								<div>
									<div class="mb-1 flex items-center justify-between text-xs font-bold">
										<span class="flex items-center gap-1.5 text-emerald-500">
											<span>🌟</span> Mastery (≥85% Accuracy)
										</span>
										<span class="text-text"
											>{analytics.studentStats?.cohortMasteryDistribution?.mastery ?? 0} students</span
										>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
										<div
											class="h-full rounded-full bg-emerald-500 transition-all duration-500"
											style="width: {analytics.studentStats?.totalStudents
												? Math.round(
														(analytics.studentStats.cohortMasteryDistribution.mastery /
															analytics.studentStats.totalStudents) *
															100
													)
												: 0}%;"
										></div>
									</div>
								</div>

								<!-- Tier 2: Proficient (70-84%) -->
								<div>
									<div class="mb-1 flex items-center justify-between text-xs font-bold">
										<span class="flex items-center gap-1.5 text-primary">
											<span>🎯</span> Proficient (70–84% Accuracy)
										</span>
										<span class="text-text"
											>{analytics.studentStats?.cohortMasteryDistribution?.proficient ?? 0} students</span
										>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
										<div
											class="h-full rounded-full bg-primary transition-all duration-500"
											style="width: {analytics.studentStats?.totalStudents
												? Math.round(
														(analytics.studentStats.cohortMasteryDistribution.proficient /
															analytics.studentStats.totalStudents) *
															100
													)
												: 0}%;"
										></div>
									</div>
								</div>

								<!-- Tier 3: Developing (50-69%) -->
								<div>
									<div class="mb-1 flex items-center justify-between text-xs font-bold">
										<span class="flex items-center gap-1.5 text-amber-500">
											<span>📈</span> Developing (50–69% Accuracy)
										</span>
										<span class="text-text"
											>{analytics.studentStats?.cohortMasteryDistribution?.developing ?? 0} students</span
										>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
										<div
											class="h-full rounded-full bg-amber-500 transition-all duration-500"
											style="width: {analytics.studentStats?.totalStudents
												? Math.round(
														(analytics.studentStats.cohortMasteryDistribution.developing /
															analytics.studentStats.totalStudents) *
															100
													)
												: 0}%;"
										></div>
									</div>
								</div>

								<!-- Tier 4: Needs Focus (<50%) -->
								<div>
									<div class="mb-1 flex items-center justify-between text-xs font-bold">
										<span class="flex items-center gap-1.5 text-rose-500">
											<span>⚠️</span> Needs Intervention (&lt;50% Accuracy)
										</span>
										<span class="text-text"
											>{analytics.studentStats?.cohortMasteryDistribution?.needsFocus ?? 0} students</span
										>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
										<div
											class="h-full rounded-full bg-rose-500 transition-all duration-500"
											style="width: {analytics.studentStats?.totalStudents
												? Math.round(
														(analytics.studentStats.cohortMasteryDistribution.needsFocus /
															analytics.studentStats.totalStudents) *
															100
													)
												: 0}%;"
										></div>
									</div>
								</div>
							</div>
						</div>

						<div
							class="mt-6 flex items-center justify-between border-t border-border/50 pt-4 text-xs text-text-muted"
						>
							<span
								>Active cohort size: <strong
									>{analytics.studentStats?.totalStudents ?? 0} students</strong
								></span
							>
							<span
								>Role breakdown: <strong>{analytics.studentStats?.totalAdmins ?? 0} Admins</strong
								></span
							>
						</div>
					</div>

					<!-- 14-Day Activity Sparkline Card -->
					<div
						class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs"
					>
						<div>
							<div class="flex items-center justify-between">
								<h3 class="font-display text-base font-bold text-text">
									Cohort Daily Quiz Activity
								</h3>
								<span class="text-xs font-bold text-text-muted">Last 14 Days</span>
							</div>
							<p class="mt-1 text-xs text-text-muted">
								Trend of aggregate daily quiz submissions and mastery accuracy across the entire
								cohort.
							</p>

							<!-- SVG Chart Rendering -->
							<div class="relative mt-4 flex h-36 w-full items-center justify-center">
								{#if activitySvgPath}
									<svg viewBox="0 0 600 140" class="h-full w-full overflow-visible">
										<defs>
											<linearGradient id="adminAreaGradient" x1="0" y1="0" x2="0" y2="1">
												<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3" />
												<stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0" />
											</linearGradient>
										</defs>
										<!-- Base grid line -->
										<line
											x1="20"
											y1="120"
											x2="580"
											y2="120"
											stroke="var(--border)"
											stroke-width="1"
											stroke-dasharray="4"
										/>
										<!-- Area fill -->
										<path d={activityAreaPath} fill="url(#adminAreaGradient)" />
										<!-- Stroke curve -->
										<path
											d={activitySvgPath}
											fill="none"
											stroke="var(--primary)"
											stroke-width="3"
											stroke-linecap="round"
										/>
									</svg>
								{:else}
									<div class="flex flex-col items-center justify-center text-xs text-text-muted">
										<span>📈 No recent quiz submissions logged yet</span>
										<span class="mt-1 text-[10px]"
											>Activity will automatically plot as students take quizzes.</span
										>
									</div>
								{/if}
							</div>
						</div>

						<div
							class="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-text-muted"
						>
							<span>Active window: <strong>Past 14 days</strong></span>
							<span class="font-medium text-primary">Auto-refreshed daily</span>
						</div>
					</div>
				</div>

				<!-- Educational Funnel & Curriculum Domain Distribution -->
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<PlatformFunnelChart
						stages={analytics.learningFunnel}
					/>
					<DomainDistributionChart
						domains={analytics.domainDistribution}
						totalCourses={analytics.coursesGenerated}
					/>
				</div>

				<!-- Curriculum Weak Concept Hotspots -->
				<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs">
					<div class="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
						<div>
							<h3 class="font-display text-base font-bold text-text">
								Curriculum Problem Areas & Weak Concept Hotspots
							</h3>
							<p class="text-xs text-text-muted">
								Aggregated cross-student learning events identifying topics where students
								experience the highest quiz error rates.
							</p>
						</div>
						<span
							class="self-start rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-500 sm:self-center"
						>
							Actionable Curriculum Feedback
						</span>
					</div>

					{#if !analytics.weakConceptHotspots || analytics.weakConceptHotspots.length === 0}
						<div class="py-8 text-center text-xs text-text-muted">
							🎉 No systemic concept weaknesses detected. Students are maintaining healthy mastery
							across all active topics.
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							{#each analytics.weakConceptHotspots as item (item.conceptId)}
								<div
									class="flex flex-col justify-between rounded-xl border border-border/60 bg-surface-muted/30 p-4 transition-all hover:border-border"
								>
									<div class="flex items-start justify-between gap-2">
										<div>
											<span class="font-display text-xs font-bold text-text">{item.tag}</span>
											<span class="block text-[10px] text-text-muted"
												>{item.totalAttempts} total student quiz attempts</span
											>
										</div>
										<span
											class="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-extrabold text-rose-500"
										>
											{item.errorRate}% Error Rate
										</span>
									</div>
									<div class="mt-3">
										<div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
											<div
												class="h-full rounded-full bg-rose-500"
												style="width: {item.errorRate}%;"
											></div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		<!-- ================= TAB 2: USERS & ACCESS GOVERNANCE ================= -->
		{#if activeTab === 'students'}
			<div class="flex flex-col gap-6">
				<!-- Tab Subheader -->
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<h2 class="font-display text-base font-bold text-text">User Directory & Role Governance</h2>
						{#if students.length > 0}
							<span class="rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-bold text-text-muted">
								{students.length} Accounts
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-muted">
						Unified user management: inspect individual learning dossiers, assign platform roles (Student, Instructor, Admin), and manage suspensions.
					</p>
				</div>

				<!-- Search and Filter Control Bar -->
				<div
					class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="relative flex-1">
						<input
							type="text"
							bind:value={searchQuery}
							oninput={fetchStudents}
							placeholder="Search by student name, email, or UID..."
							class="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-hidden"
						/>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<!-- Role Filter -->
						<select
							bind:value={roleFilter}
							onchange={fetchStudents}
							class="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-bold text-text focus:border-primary focus:outline-hidden"
						>
							<option value="all">All Roles</option>
							<option value="student">Students</option>
							<option value="instructor">Instructors</option>
							<option value="admin">Admins</option>
							<option value="superadmin">Super Admins</option>
						</select>

						<!-- Status Filter -->
						<select
							bind:value={statusFilter}
							onchange={fetchStudents}
							class="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-bold text-text focus:border-primary focus:outline-hidden"
						>
							<option value="all">All Statuses</option>
							<option value="active">Active Only</option>
							<option value="suspended">Suspended Only</option>
						</select>

						<!-- Sort Filter -->
						<select
							bind:value={sortFilter}
							onchange={fetchStudents}
							class="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-bold text-text focus:border-primary focus:outline-hidden"
						>
							<option value="recent">Recently Joined</option>
							<option value="streak">Highest Streak</option>
							<option value="accuracy">Best Accuracy</option>
							<option value="courses">Most Courses</option>
						</select>
					</div>
				</div>

				<!-- Students Roster Table -->
				<div class="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
					{#if loadingStudents}
						<div class="flex flex-col gap-3 p-6">
							<Skeleton variant="text" />
							<Skeleton variant="text" />
							<Skeleton variant="text" />
						</div>
					{:else if students.length === 0}
						<div class="py-12 text-center">
							<span class="text-3xl">👥</span>
							<h3 class="mt-2 font-display text-sm font-bold text-text">No students found</h3>
							<p class="text-xs text-text-muted">
								Adjust your search query or role filter to see results.
							</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full text-left text-xs">
								<thead
									class="border-b border-border/70 bg-surface-muted/50 font-bold tracking-wider text-text-muted uppercase"
								>
									<tr>
										<th class="px-5 py-3.5">Student / User</th>
										<th class="px-4 py-3.5">RBAC Role</th>
										<th class="px-4 py-3.5">Status</th>
										<th class="px-4 py-3.5">Learning Stats</th>
										<th class="px-4 py-3.5">Quiz Accuracy</th>
										<th class="px-5 py-3.5 text-right">Actions</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-border/40">
									{#each students as s (s.uid)}
										<tr class="transition-colors hover:bg-surface-muted/30">
											<!-- Student Info -->
											<td class="px-5 py-3.5">
												<div class="flex items-center gap-3">
													<Avatar
														src={s.photoURL}
														name={s.displayName || s.email}
														size="lg"
													/>
													<div>
														<div class="font-bold text-text">
															{s.displayName || 'Unnamed Student'}
														</div>
														<div class="font-mono text-[11px] text-text-muted">{s.email}</div>
													</div>
												</div>
											</td>

											<!-- Role Badge -->
											<td class="px-4 py-3.5">
												<span
													class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-extrabold tracking-wider uppercase {s.role ===
													'superadmin'
														? 'border border-violet-500/30 bg-violet-500/15 text-violet-400'
														: s.role === 'admin'
															? 'border border-indigo-500/30 bg-indigo-500/15 text-indigo-400'
															: 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'}"
												>
													{s.role}
												</span>
											</td>

											<!-- Account Status -->
											<td class="px-4 py-3.5">
												{#if s.isBanned}
													<span
														class="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500"
													>
														● Suspended
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400"
													>
														● Active
													</span>
												{/if}
											</td>

											<!-- Learning Metrics -->
											<td class="px-4 py-3.5">
												<div class="flex items-center gap-3 text-text-muted">
													<span title="Current streak" class="flex items-center gap-1">
														🔥 <strong class="text-text">{s.streakCurrent}d</strong>
													</span>
													<span>&bull;</span>
													<span title="Courses generated">
														📚 <strong class="text-text">{s.courseCount}</strong>
													</span>
													<span>&bull;</span>
													<span title="Quizzes taken">
														📝 <strong class="text-text">{s.quizzesTaken}</strong>
													</span>
												</div>
											</td>

											<!-- Accuracy -->
											<td class="px-4 py-3.5">
												<div class="flex items-center gap-2">
													<span class="font-bold text-text">{s.averageAccuracy}%</span>
													<div class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
														<div
															class="h-full {s.averageAccuracy >= 70
																? 'bg-emerald-500'
																: 'bg-amber-500'}"
															style="width: {s.averageAccuracy}%;"
														></div>
													</div>
												</div>
											</td>

											<!-- Actions -->
											<td class="px-5 py-3.5 text-right">
												<div class="inline-flex items-center gap-1.5">
													<button
														type="button"
														onclick={() => inspectStudent(s.uid)}
														class="cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-text transition-colors hover:bg-surface-muted"
													>
														Inspect
													</button>

													<button
														type="button"
														onclick={() => openRoleModal(s)}
														class="cursor-pointer rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
													>
														Role
													</button>

													<button
														type="button"
														onclick={() => toggleQuickSuspend(s)}
														class="cursor-pointer rounded-lg border border-border px-2 py-1 text-[11px] font-bold transition-colors {s.isBanned
															? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
															: 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'}"
													>
														{s.isBanned ? 'Activate' : 'Suspend'}
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ================= TAB 3: SYSTEM & AI HEALTH ================= -->
		{#if activeTab === 'system'}
			<div class="flex flex-col gap-6">
				<!-- Traffic Routing & Tier Visualization Chart -->
				<InferenceTelemetryChart
					geminiCount={analytics?.fallbackFrequency?.geminiCount ?? 0}
					mlBackendCount={analytics?.fallbackFrequency?.mlBackendCount ?? 0}
					ollamaCount={analytics?.fallbackFrequency?.ollamaCount ?? 0}
					fallbackPercentage={analytics?.fallbackFrequency?.fallbackPercentage ?? 0}
					mlBackendHealth={analytics?.mlBackendHealth}
				/>

				<!-- Fallback Stats Card -->
				<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs">
					<div class="flex items-center justify-between">
						<h3 class="font-display text-base font-bold text-text">
							AI Inference & Provider Fallback Telemetry
						</h3>
						<span
							class="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400"
						>
							3-Tier Resilient Chain
						</span>
					</div>

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div
							class="flex flex-col gap-1 rounded-xl border border-border/60 bg-surface-muted/30 p-4"
						>
							<span class="text-[11px] font-bold text-text-muted uppercase"
								>Gemini Cloud API Calls</span
							>
							<span class="font-display text-2xl font-black text-primary">
								{analytics?.fallbackFrequency?.geminiCount ?? 0}
							</span>
							<span class="text-[10px] text-text-muted">Primary cloud provider</span>
						</div>

						<div
							class="flex flex-col gap-1 rounded-xl border border-border/60 bg-surface-muted/30 p-4"
						>
							<span class="text-[11px] font-bold text-text-muted uppercase"
								>Self-Hosted ML Backend</span
							>
							<span class="font-display text-2xl font-black text-emerald-400">
								{analytics?.fallbackFrequency?.mlBackendCount ?? 0}
							</span>
							<span class="text-[10px] text-text-muted">Local PyTorch CPU engine</span>
						</div>

						<div
							class="flex flex-col gap-1 rounded-xl border border-border/60 bg-surface-muted/30 p-4"
						>
							<span class="text-[11px] font-bold text-text-muted uppercase">Fallback Ratio</span>
							<span class="font-display text-2xl font-black text-amber-400">
								{analytics?.fallbackFrequency?.fallbackPercentage ?? 0}%
							</span>
							<span class="text-[10px] text-text-muted">Automatic failover percentage</span>
						</div>
					</div>
				</div>

				<!-- Local ML Backend Health Grid -->
				<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs">
					<div class="flex items-center justify-between">
						<h3 class="font-display text-base font-bold text-text">
							Local Model Weights & RAG Health
						</h3>
						<span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
							Dynamic INT8 Active
						</span>
					</div>

					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
						{#each [{ name: 'Summarizer', id: 'flan-t5-base', key: 'summarizer' }, { name: 'Paraphraser', id: 'flan-t5-base', key: 'paraphraser' }, { name: 'Outline Gen', id: 'flan-t5-large', key: 'outline_generator' }, { name: 'Lesson Gen', id: 'flan-t5-large', key: 'lesson_generator' }, { name: 'Quiz Pipeline', id: 'mixqg-base', key: 'quiz_pipeline' }, { name: 'AI Chat', id: 'TinyLlama-1.1B', key: 'chat_assistant' }] as m (m.name)}
							{@const status = getModelStatus(m.key)}
							<div
								class="flex flex-col gap-1 rounded-xl border border-border/50 bg-surface p-3 text-center shadow-2xs"
							>
								<span class="text-[11px] font-bold text-text">{m.name}</span>
								<span class="font-mono text-[9px] text-text-muted">{m.id}</span>
								<span
									class="mt-1 rounded-full py-0.5 text-[10px] font-bold {status === 'Ready'
										? 'bg-emerald-500/15 text-emerald-400'
										: 'bg-amber-500/15 text-amber-400'}"
								>
									● {status}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- ================= STUDENT DOSSIER INSPECT MODAL ================= -->
{#if selectedStudent || loadingDossier}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
		<div
			class="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl"
		>
			<button
				type="button"
				onclick={() => (selectedStudent = null)}
				class="absolute top-5 right-5 cursor-pointer rounded-xl border border-border p-2 text-text-muted hover:bg-surface-muted hover:text-text"
			>
				✕
			</button>

			{#if loadingDossier}
				<div class="py-12 text-center">
					<div
						class="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"
					></div>
					<p class="mt-3 text-xs font-bold text-text-muted">Loading student dossier...</p>
				</div>
			{:else if dossierError}
				<div
					class="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center text-xs text-danger"
				>
					{dossierError}
				</div>
			{:else if selectedStudent}
				<div class="flex flex-col gap-6">
					<!-- Student Header -->
					<div class="flex items-center gap-4">
						<Avatar
							src={selectedStudent.photoURL}
							name={selectedStudent.displayName || selectedStudent.email}
							size="custom"
							shape="rounded"
							class="h-14 w-14 text-xl font-bold"
						/>
						<div>
							<div class="flex items-center gap-2">
								<h2 class="font-display text-lg font-bold text-text">
									{selectedStudent.displayName || 'Unnamed Student'}
								</h2>
								<span
									class="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase"
								>
									{selectedStudent.role}
								</span>
							</div>
							<div class="font-mono text-xs text-text-muted">{selectedStudent.email}</div>
							<div class="text-[11px] text-text-muted">
								UID: <span class="font-mono">{selectedStudent.uid}</span>
							</div>
						</div>
					</div>

					<!-- Key Metrics -->
					<div class="grid grid-cols-3 gap-3">
						<div class="rounded-xl border border-border bg-surface-muted/40 p-3 text-center">
							<span class="text-[10px] font-bold text-text-muted uppercase">Study Streak</span>
							<div class="font-display text-lg font-black text-text">
								🔥 {selectedStudent.streak.current} days
							</div>
						</div>
						<div class="rounded-xl border border-border bg-surface-muted/40 p-3 text-center">
							<span class="text-[10px] font-bold text-text-muted uppercase">Study Sessions</span>
							<div class="font-display text-lg font-black text-primary">
								{selectedStudent.learningProfile.sessionCount}
							</div>
						</div>
						<div class="rounded-xl border border-border bg-surface-muted/40 p-3 text-center">
							<span class="text-[10px] font-bold text-text-muted uppercase">Total Study Time</span>
							<div class="font-display text-lg font-black text-emerald-400">
								{Math.round(selectedStudent.learningProfile.totalStudyTimeMs / 60000)}m
							</div>
						</div>
					</div>

					<!-- Enrolled Courses -->
					<div>
						<h4 class="mb-2 font-display text-xs font-bold tracking-wider text-text uppercase">
							Created & Enrolled Courses ({selectedStudent.courses.length})
						</h4>
						{#if selectedStudent.courses.length === 0}
							<div
								class="rounded-xl border border-border/50 p-4 text-center text-xs text-text-muted"
							>
								No courses created yet.
							</div>
						{:else}
							<div class="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
								{#each selectedStudent.courses as c (c.id)}
									<div
										class="flex items-center justify-between rounded-xl border border-border/60 bg-surface-muted/30 p-3 text-xs"
									>
										<span class="font-bold text-text">{c.title}</span>
										<span class="font-mono text-text-muted"
											>{c.completedCount}/{c.moduleCount} modules</span
										>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Weak Concepts Identified -->
					<div>
						<h4 class="mb-2 font-display text-xs font-bold tracking-wider text-text uppercase">
							Identified Growth Areas / Weak Concepts
						</h4>
						{#if selectedStudent.learningProfile.weakConcepts.length === 0}
							<div
								class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center text-xs text-emerald-400"
							>
								✓ No weak concept alerts! High accuracy maintained across all tested topics.
							</div>
						{:else}
							<div class="flex flex-wrap gap-2">
								{#each selectedStudent.learningProfile.weakConcepts as w (w)}
									<span
										class="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-500"
									>
										⚠️ {w}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- ================= ROLE & ACCESS CONTROL MODAL ================= -->
{#if editingUser}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
		<div
			class="relative w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl"
		>
			<h3 class="font-display text-base font-bold text-text">Manage RBAC Role & Status</h3>
			<p class="mt-1 text-xs text-text-muted">
				Update access tier and account active status for <strong
					>{editingUser.displayName || editingUser.email}</strong
				>.
			</p>

			<div class="mt-5 flex flex-col gap-4">
				<!-- Role Selector -->
				<div>
					<label for="rbac-role-select" class="mb-1.5 block text-xs font-bold text-text-muted"
						>Assign Role</label
					>
					<select
						id="rbac-role-select"
						bind:value={targetRole}
						class="w-full rounded-xl border border-border bg-surface-muted p-2.5 text-xs font-bold text-text focus:border-primary focus:outline-hidden"
					>
						<option value="student">Student (Standard Learner)</option>
						<option value="instructor">Instructor (Course & Analytics Access)</option>
						<option value="admin">Administrator (Full Platform Control)</option>
					</select>
				</div>

				<!-- Suspension Checkbox -->
				<div class="rounded-xl border border-border/70 bg-surface-muted/40 p-3.5">
					<label class="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							bind:checked={targetBanned}
							class="h-4 w-4 rounded-md border-border text-primary focus:ring-0"
						/>
						<div>
							<span class="text-xs font-bold text-text">Account Suspended</span>
							<span class="block text-[11px] text-text-muted"
								>Prevents student from logging in and accessing materials</span
							>
						</div>
					</label>

					{#if targetBanned}
						<input
							type="text"
							bind:value={banReason}
							placeholder="Reason for suspension..."
							class="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-hidden"
						/>
					{/if}
				</div>

				<!-- Buttons -->
				<div class="mt-2 flex items-center justify-end gap-3">
					<button
						type="button"
						onclick={() => (editingUser = null)}
						class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={savingRole}
						onclick={saveRoleAndStatus}
						class="cursor-pointer rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-primary-hover active:scale-98 disabled:opacity-50"
					>
						{savingRole ? 'Saving...' : 'Save RBAC Changes'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
