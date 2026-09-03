<script lang="ts">
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api/client';
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
			const { data } = await apiFetch<{ user: DetailedUser }>(`/api/superadmin/users/${targetUid}`);
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
			await apiFetch(`/api/superadmin/users/${targetUid}`, {
				method: 'PATCH',
				body: {
					role: targetRole,
					isBanned: targetBanned,
					bannedReason: banReason
				}
			});

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

<div class="flex w-full flex-col gap-6">
	<!-- Breadcrumb Navigation -->
	<div class="flex items-center gap-2 text-xs font-bold text-text-muted">
		<a href={resolve('/superadmin/user-management')} class="transition-colors hover:text-primary">
			← Back to User Directory
		</a>
	</div>

	{#if loading}
		<Skeleton variant="card" />
	{:else if errorMsg}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-8 text-center text-xs font-bold text-danger"
		>
			{errorMsg}
		</div>
	{:else if user}
		<!-- Header Profile Card -->
		<div
			class="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="flex items-center gap-4">
				{#if user.photoURL}
					<img
						src={user.photoURL}
						alt={user.displayName || 'User'}
						class="h-16 w-16 rounded-full border-2 border-border object-cover"
					/>
				{:else}
					<div
						class="flex h-16 w-16 items-center justify-center rounded-full bg-violet-600 text-xl font-black text-white"
					>
						{(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<h1 class="font-display text-xl font-bold text-text sm:text-2xl">
							{user.displayName || 'Unnamed User'}
						</h1>
						{#if user.role === 'superadmin'}
							<span
								class="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-extrabold text-violet-500"
							>
								👑 Super Admin
							</span>
						{:else if user.role === 'admin'}
							<span
								class="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[10px] font-extrabold text-primary"
							>
								🛡️ Admin
							</span>
						{/if}

						{#if user.isBanned}
							<span
								class="rounded-full border border-danger/30 bg-danger-soft px-2.5 py-0.5 text-[10px] font-extrabold text-danger"
							>
								🚫 Suspended
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-muted">{user.email}</p>
					<p class="font-mono text-[11px] text-text-muted/80">UID: {user.uid}</p>
				</div>
			</div>

			<div class="flex items-center gap-4 border-t border-border pt-4 sm:border-t-0 sm:pt-0">
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
		<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Column 1: Administrative Controls -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs md:col-span-1"
			>
				<h2 class="font-display text-base font-bold text-text">Account Control Panel</h2>

				{#if updateMsg}
					<div
						class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-500"
					>
						{updateMsg}
					</div>
				{/if}

				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-2">
						<label
							for="detail-user-role"
							class="text-xs font-bold tracking-wider text-text uppercase">Access Role</label
						>
						<select
							id="detail-user-role"
							bind:value={targetRole}
							class="rounded-xl border border-border bg-surface-muted p-2.5 text-xs font-bold text-text focus:border-primary focus:outline-none"
						>
							<option value="user">Student User</option>
							<option value="admin">Administrator</option>
							<option value="superadmin">Super Administrator</option>
						</select>
					</div>

					<div class="flex flex-col gap-2 border-t border-border/60 pt-4">
						<label class="flex cursor-pointer items-center gap-2">
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
								class="mt-2 w-full rounded-xl border border-danger/30 bg-danger-soft p-2.5 text-xs font-semibold text-danger placeholder-danger/60 focus:outline-none"
							/>
						{/if}
					</div>

					<button
						type="button"
						onclick={handleSave}
						disabled={updating}
						class="mt-2 cursor-pointer rounded-xl bg-primary py-2.5 text-xs font-bold text-white transition-all hover:bg-primary-hover disabled:opacity-50"
					>
						{updating ? 'Saving...' : 'Save Privileges'}
					</button>
				</div>
			</div>

			<!-- Column 2 & 3: Generated Courses -->
			<div
				class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs md:col-span-2"
			>
				<h2 class="font-display text-base font-bold text-text">
					Generated Courses ({user.courses.length})
				</h2>

				{#if user.courses.length === 0}
					<div
						class="rounded-xl border border-border bg-surface-muted p-8 text-center text-xs text-text-muted"
					>
						This user has not generated any courses yet.
					</div>
				{:else}
					<div class="flex max-h-96 flex-col gap-2.5 overflow-y-auto pr-1">
						{#each user.courses as course (course.id)}
							<div
								class="flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/50 p-3 text-xs"
							>
								<div class="flex flex-col">
									<span class="font-bold text-text">{course.title}</span>
									<span class="text-[10px] text-text-muted">
										Created: {new Date(course.createdAt).toLocaleDateString()}
									</span>
								</div>
								<a
									href={resolve(`/app/courses/${course.id}` as '/app')}
									class="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary-soft"
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
