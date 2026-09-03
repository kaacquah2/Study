<script lang="ts">
	import { apiFetch } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { resolve } from '$app/paths';

	interface SuperAdminStats {
		totalUsers: number;
		adminUsers: number;
		superadminUsers: number;
		bannedUsers: number;
		recentUsersCount: number;
	}

	let stats = $state<SuperAdminStats | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');

	$effect(() => {
		if (authStore.user) {
			fetchStats();
		}
	});

	const fetchStats = async () => {
		loading = true;
		errorMsg = '';
		try {
			const { data } = await apiFetch<{ stats: SuperAdminStats }>('/api/superadmin/stats');
			stats = data.stats;
		} catch (err) {
			console.error('Superadmin stats error:', err);
			errorMsg = err instanceof Error ? err.message : 'Failed to load stats';
		} finally {
			loading = false;
		}
	};
</script>

<svelte:head>
	<title>Super Admin Dashboard &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex w-full flex-col gap-8">
	<!-- Hero Heading -->
	<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<div
				class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-500"
			>
				⚡ Platform Administration & Control
			</div>
			<h1 class="font-display text-2xl font-black text-text sm:text-3xl">Root System Dashboard</h1>
			<p class="mt-1 text-xs text-text-muted sm:text-sm">
				Manage accounts, roles, access permissions, and core platform capabilities.
			</p>
		</div>

		<div class="flex items-center gap-3">
			<a
				href={resolve('/superadmin/user-management')}
				class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-primary/20 shadow-md transition-all hover:bg-primary-hover active:scale-95"
			>
				<span>👥 Manage Users</span>
			</a>
		</div>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div class="rounded-2xl border border-danger/20 bg-danger-soft p-8 text-center shadow-xs">
			<div class="mb-2 text-3xl">🚫</div>
			<h2 class="font-display text-base font-bold text-danger">Super Admin Access Required</h2>
			<p class="mt-1 text-xs text-danger/80">{errorMsg}</p>
		</div>
	{:else if stats}
		<!-- Stats Grid -->
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
			<!-- Stat 1: Total Users -->
			<div
				class="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-xs transition-all hover:border-primary/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase">Total Users</span
					>
					<span class="rounded-lg bg-primary-soft p-2 text-base text-primary">👤</span>
				</div>
				<div class="font-display text-3xl font-black text-text">{stats.totalUsers}</div>
				<span class="text-[11px] font-semibold text-emerald-500">
					+{stats.recentUsersCount} new users in last 30 days
				</span>
			</div>

			<!-- Stat 2: Active Admins -->
			<div
				class="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-xs transition-all hover:border-violet-500/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Admins & Super</span
					>
					<span class="rounded-lg bg-violet-500/10 p-2 text-base text-violet-500">🛡️</span>
				</div>
				<div class="font-display text-3xl font-black text-violet-500">
					{stats.adminUsers + stats.superadminUsers}
				</div>
				<span class="text-[11px] font-semibold text-text-muted">
					{stats.superadminUsers} Super Admins &bull; {stats.adminUsers} Admins
				</span>
			</div>

			<!-- Stat 3: Banned Users -->
			<div
				class="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-xs transition-all hover:border-danger/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Banned Accounts</span
					>
					<span class="rounded-lg bg-danger-soft p-2 text-base text-danger">⚠️</span>
				</div>
				<div class="font-display text-3xl font-black text-danger">{stats.bannedUsers}</div>
				<span class="text-[11px] font-semibold text-text-muted">Access suspended</span>
			</div>

			<!-- Stat 4: System Health -->
			<div
				class="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-xs transition-all hover:border-emerald-500/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Platform Status</span
					>
					<span class="rounded-lg bg-emerald-500/10 p-2 text-base text-emerald-500">✅</span>
				</div>
				<div class="font-display text-3xl font-black text-emerald-500">Operational</div>
				<span class="text-[11px] font-semibold text-text-muted"
					>Firebase Auth & Firestore Active</span
				>
			</div>
		</div>

		<!-- Quick Management Cards -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<!-- Card 1: User Management Shortcut -->
			<div
				class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs"
			>
				<div class="flex flex-col gap-2">
					<div class="flex items-center gap-2">
						<span class="text-2xl">👥</span>
						<h3 class="font-display text-lg font-bold text-text">User Management Suite</h3>
					</div>
					<p class="text-xs leading-relaxed text-text-muted">
						View all registered user accounts, search by name/email, update user permissions, assign
						Admin or Super Admin roles, or suspend abusive accounts.
					</p>
				</div>
				<div class="mt-6 flex items-center gap-3">
					<a
						href={resolve('/superadmin/user-management')}
						class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition-all hover:bg-primary-hover"
					>
						<span>Open User Management →</span>
					</a>
				</div>
			</div>

			<!-- Card 2: System Analytics Shortcut -->
			<div
				class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs"
			>
				<div class="flex flex-col gap-2">
					<div class="flex items-center gap-2">
						<span class="text-2xl">📊</span>
						<h3 class="font-display text-lg font-bold text-text">Platform Analytics</h3>
					</div>
					<p class="text-xs leading-relaxed text-text-muted">
						Monitor platform course generation counts, average quiz accuracy across students,
						flagged content items, and primary/fallback AI inference metrics.
					</p>
				</div>
				<div class="mt-6 flex items-center gap-3">
					<a
						href={resolve('/app/admin')}
						class="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-bold text-text transition-all hover:bg-border/40"
					>
						<span>View Analytics Dashboard →</span>
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
