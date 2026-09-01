<script lang="ts">
	import { auth } from '$lib/firebase/client';
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
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/superadmin/stats', {
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Access restricted to Super Administrators.');
			}

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

<div class="gap-8 flex w-full flex-col">
	<!-- Hero Heading -->
	<div class="gap-4 sm:flex-row sm:items-center flex flex-col justify-between">
		<div>
			<div
				class="mb-2 gap-1.5 border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-500 inline-flex items-center rounded-full border"
			>
				⚡ Platform Administration & Control
			</div>
			<h1 class="font-display text-2xl font-black sm:text-3xl text-text">Root System Dashboard</h1>
			<p class="mt-1 text-xs sm:text-sm text-text-muted">
				Manage accounts, roles, access permissions, and core platform capabilities.
			</p>
		</div>

		<div class="gap-3 flex items-center">
			<a
				href={resolve('/superadmin/user-management')}
				class="gap-2 px-4 py-2.5 text-xs font-bold text-white inline-flex items-center rounded-xl bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
			>
				<span>👥 Manage Users</span>
			</a>
		</div>
	</div>

	{#if loading}
		<div class="gap-6 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div class="rounded-2xl p-8 shadow-xs border border-danger/20 bg-danger-soft text-center">
			<div class="mb-2 text-3xl">🚫</div>
			<h2 class="font-display text-base font-bold text-danger">Super Admin Access Required</h2>
			<p class="mt-1 text-xs text-danger/80">{errorMsg}</p>
		</div>
	{:else if stats}
		<!-- Stats Grid -->
		<div class="gap-6 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
			<!-- Stat 1: Total Users -->
			<div
				class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface transition-all hover:border-primary/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase">Total Users</span
					>
					<span class="p-2 text-base rounded-lg bg-primary-soft text-primary">👤</span>
				</div>
				<div class="font-display text-3xl font-black text-text">{stats.totalUsers}</div>
				<span class="font-semibold text-emerald-500 text-[11px]">
					+{stats.recentUsersCount} new users in last 30 days
				</span>
			</div>

			<!-- Stat 2: Active Admins -->
			<div
				class="gap-2 rounded-2xl p-6 shadow-xs hover:border-violet-500/40 flex flex-col border border-border bg-surface transition-all"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Admins & Super</span
					>
					<span class="bg-violet-500/10 p-2 text-base text-violet-500 rounded-lg">🛡️</span>
				</div>
				<div class="font-display text-3xl font-black text-violet-500">
					{stats.adminUsers + stats.superadminUsers}
				</div>
				<span class="font-semibold text-[11px] text-text-muted">
					{stats.superadminUsers} Super Admins &bull; {stats.adminUsers} Admins
				</span>
			</div>

			<!-- Stat 3: Banned Users -->
			<div
				class="gap-2 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface transition-all hover:border-danger/40"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Banned Accounts</span
					>
					<span class="p-2 text-base rounded-lg bg-danger-soft text-danger">⚠️</span>
				</div>
				<div class="font-display text-3xl font-black text-danger">{stats.bannedUsers}</div>
				<span class="font-semibold text-[11px] text-text-muted">Access suspended</span>
			</div>

			<!-- Stat 4: System Health -->
			<div
				class="gap-2 rounded-2xl p-6 shadow-xs hover:border-emerald-500/40 flex flex-col border border-border bg-surface transition-all"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Platform Status</span
					>
					<span class="bg-emerald-500/10 p-2 text-base text-emerald-500 rounded-lg">✅</span>
				</div>
				<div class="font-display text-3xl font-black text-emerald-500">Operational</div>
				<span class="font-semibold text-[11px] text-text-muted"
					>Firebase Auth & Firestore Active</span
				>
			</div>
		</div>

		<!-- Quick Management Cards -->
		<div class="gap-6 md:grid-cols-2 grid grid-cols-1">
			<!-- Card 1: User Management Shortcut -->
			<div
				class="rounded-2xl p-6 shadow-xs flex flex-col justify-between border border-border bg-surface"
			>
				<div class="gap-2 flex flex-col">
					<div class="gap-2 flex items-center">
						<span class="text-2xl">👥</span>
						<h3 class="font-display text-lg font-bold text-text">User Management Suite</h3>
					</div>
					<p class="text-xs leading-relaxed text-text-muted">
						View all registered user accounts, search by name/email, update user permissions, assign
						Admin or Super Admin roles, or suspend abusive accounts.
					</p>
				</div>
				<div class="mt-6 gap-3 flex items-center">
					<a
						href={resolve('/superadmin/user-management')}
						class="gap-2 px-4 py-2 text-xs font-bold text-white inline-flex items-center justify-center rounded-xl bg-primary transition-all hover:bg-primary-hover"
					>
						<span>Open User Management →</span>
					</a>
				</div>
			</div>

			<!-- Card 2: System Analytics Shortcut -->
			<div
				class="rounded-2xl p-6 shadow-xs flex flex-col justify-between border border-border bg-surface"
			>
				<div class="gap-2 flex flex-col">
					<div class="gap-2 flex items-center">
						<span class="text-2xl">📊</span>
						<h3 class="font-display text-lg font-bold text-text">Platform Analytics</h3>
					</div>
					<p class="text-xs leading-relaxed text-text-muted">
						Monitor platform course generation counts, average quiz accuracy across students,
						flagged content items, and primary/fallback AI inference metrics.
					</p>
				</div>
				<div class="mt-6 gap-3 flex items-center">
					<a
						href={resolve('/app/admin')}
						class="gap-2 px-4 py-2 text-xs font-bold inline-flex items-center justify-center rounded-xl border border-border bg-surface-muted text-text transition-all hover:bg-border/40"
					>
						<span>View Analytics Dashboard →</span>
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
