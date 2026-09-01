<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '$lib/firebase/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { resolve } from '$app/paths';

	interface DetailedUser {
		uid: string;
		email: string;
		displayName: string | null;
		photoURL: string | null;
		role: 'user' | 'admin' | 'superadmin';
		isBanned: boolean;
		bannedReason?: string | null;
		createdAt: string;
		streakCurrent?: number;
		streakLongest?: number;
		courseCount?: number;
		courses: Array<{ id: string; title: string; createdAt: string }>;
	}

	let targetUid = $derived(page.params.uid);
	let user = $state<DetailedUser | null>(null);
	let loading = $state(true);
	let errorMsg = $state('');

	let targetRole = $state<'user' | 'admin' | 'superadmin'>('user');
	let targetBanned = $state(false);
	let banReason = $state('');
	let updating = $state(false);
	let updateMsg = $state('');

	$effect(() => {
		if (authStore.user && targetUid) {
			fetchUserDetails();
		}
	});

	const fetchUserDetails = async () => {
		loading = true;
		errorMsg = '';
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/superadmin/users/${targetUid}`, {
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Failed to fetch user profile');
			}

			user = data.user;
			if (user) {
				targetRole = user.role;
				targetBanned = user.isBanned;
				banReason = user.bannedReason || '';
			}
		} catch (err) {
			console.error('Fetch user detail error:', err);
			errorMsg = err instanceof Error ? err.message : 'Error loading user';
		} finally {
			loading = false;
		}
	};

	const handleSave = async () => {
		if (!user) return;
		updating = true;
		updateMsg = '';

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/superadmin/users/${targetUid}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${idToken}`
				},
				body: JSON.stringify({
					role: targetRole,
					isBanned: targetBanned,
					bannedReason: banReason
				})
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Failed to update user status');
			}

			updateMsg = 'User updated successfully!';
			await fetchUserDetails();
		} catch (err) {
			console.error('Save error:', err);
			alert(err instanceof Error ? err.message : 'Failed to save changes');
		} finally {
			updating = false;
		}
	};
</script>

<svelte:head>
	<title>{user ? user.displayName || user.email : 'User Detail'} &mdash; Super Admin</title>
</svelte:head>

<div class="gap-6 flex w-full flex-col">
	<!-- Breadcrumb Navigation -->
	<div class="gap-2 text-xs font-bold flex items-center text-text-muted">
		<a href={resolve('/superadmin/user-management')} class="transition-colors hover:text-primary">
			← Back to User Directory
		</a>
	</div>

	{#if loading}
		<Skeleton variant="card" />
	{:else if errorMsg}
		<div
			class="rounded-2xl p-8 text-xs font-bold border border-danger/20 bg-danger-soft text-center text-danger"
		>
			{errorMsg}
		</div>
	{:else if user}
		<!-- Header Profile Card -->
		<div
			class="gap-6 rounded-2xl p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between flex flex-col border border-border bg-surface"
		>
			<div class="gap-4 flex items-center">
				{#if user.photoURL}
					<img
						src={user.photoURL}
						alt={user.displayName || 'User'}
						class="h-16 w-16 rounded-full border-2 border-border object-cover"
					/>
				{:else}
					<div
						class="h-16 w-16 bg-violet-600 text-xl font-black text-white flex items-center justify-center rounded-full"
					>
						{(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
					</div>
				{/if}

				<div class="gap-1 flex flex-col">
					<div class="gap-2 flex items-center">
						<h1 class="font-display text-xl font-bold sm:text-2xl text-text">
							{user.displayName || 'Unnamed User'}
						</h1>
						{#if user.role === 'superadmin'}
							<span
								class="border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 font-extrabold text-violet-500 rounded-full border text-[10px]"
							>
								👑 Super Admin
							</span>
						{:else if user.role === 'admin'}
							<span
								class="px-2.5 py-0.5 font-extrabold rounded-full border border-primary/30 bg-primary-soft text-[10px] text-primary"
							>
								🛡️ Admin
							</span>
						{/if}

						{#if user.isBanned}
							<span
								class="px-2.5 py-0.5 font-extrabold rounded-full border border-danger/30 bg-danger-soft text-[10px] text-danger"
							>
								🚫 Suspended
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-muted">{user.email}</p>
					<p class="font-mono text-[11px] text-text-muted/80">UID: {user.uid}</p>
				</div>
			</div>

			<div class="gap-4 pt-4 sm:border-t-0 sm:pt-0 flex items-center border-t border-border">
				<div class="flex flex-col text-right">
					<span class="text-xs font-bold text-text-muted">Streak</span>
					<span class="font-display text-base font-black text-primary"
						>🔥 {user.streakCurrent || 0}d</span
					>
				</div>
				<div class="h-8 w-px bg-border"></div>
				<div class="flex flex-col text-right">
					<span class="text-xs font-bold text-text-muted">Courses</span>
					<span class="font-display text-base font-black text-emerald-500"
						>{user.courseCount || 0}</span
					>
				</div>
			</div>
		</div>

		<!-- Action Panel & Course List Grid -->
		<div class="gap-6 md:grid-cols-3 grid grid-cols-1">
			<!-- Column 1: Administrative Controls -->
			<div
				class="gap-4 rounded-2xl p-6 shadow-xs md:col-span-1 flex flex-col border border-border bg-surface"
			>
				<h2 class="font-display text-base font-bold text-text">Account Control Panel</h2>

				{#if updateMsg}
					<div
						class="border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-500 rounded-xl border text-center"
					>
						{updateMsg}
					</div>
				{/if}

				<div class="gap-4 flex flex-col">
					<div class="gap-2 flex flex-col">
						<label
							for="detail-user-role"
							class="text-xs font-bold tracking-wider text-text uppercase">Access Role</label
						>
						<select
							id="detail-user-role"
							bind:value={targetRole}
							class="p-2.5 text-xs font-bold rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
						>
							<option value="user">Student User</option>
							<option value="admin">Administrator</option>
							<option value="superadmin">Super Administrator</option>
						</select>
					</div>

					<div class="gap-2 pt-4 flex flex-col border-t border-border/60">
						<label class="gap-2 flex cursor-pointer items-center">
							<input
								type="checkbox"
								bind:checked={targetBanned}
								class="h-4 w-4 rounded border-border text-danger focus:ring-danger"
							/>
							<span class="text-xs font-bold text-danger">Suspend Account Access</span>
						</label>

						{#if targetBanned}
							<input
								type="text"
								placeholder="Reason for suspension..."
								bind:value={banReason}
								class="mt-2 p-2.5 text-xs font-semibold w-full rounded-xl border border-danger/30 bg-danger-soft text-danger placeholder-danger/60 focus:outline-none"
							/>
						{/if}
					</div>

					<button
						type="button"
						onclick={handleSave}
						disabled={updating}
						class="mt-2 py-2.5 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover disabled:opacity-50"
					>
						{updating ? 'Saving...' : 'Save Privileges'}
					</button>
				</div>
			</div>

			<!-- Column 2 & 3: Generated Courses -->
			<div
				class="gap-4 rounded-2xl p-6 shadow-xs md:col-span-2 flex flex-col border border-border bg-surface"
			>
				<h2 class="font-display text-base font-bold text-text">
					Generated Courses ({user.courses.length})
				</h2>

				{#if user.courses.length === 0}
					<div
						class="p-8 text-xs rounded-xl border border-border bg-surface-muted text-center text-text-muted"
					>
						This user has not generated any courses yet.
					</div>
				{:else}
					<div class="max-h-96 gap-2.5 pr-1 flex flex-col overflow-y-auto">
						{#each user.courses as course (course.id)}
							<div
								class="p-3 text-xs flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/50"
							>
								<div class="flex flex-col">
									<span class="font-bold text-text">{course.title}</span>
									<span class="text-[10px] text-text-muted">
										Created: {new Date(course.createdAt).toLocaleDateString()}
									</span>
								</div>
								<a
									href={resolve(`/app/courses/${course.id}` as '/app')}
									class="px-3 py-1.5 text-xs font-bold rounded-lg border border-border bg-surface text-primary transition-colors hover:bg-primary-soft"
								>
									Open Course →
								</a>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
