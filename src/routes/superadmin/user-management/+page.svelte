<script lang="ts">
	import { apiFetch } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { resolve } from '$app/paths';

	interface UserRecord {
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
	}

	let users = $state<UserRecord[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

	// Search and filter controls
	let searchQuery = $state('');
	let roleFilter = $state('all');
	let statusFilter = $state('all');

	// Action Modal State
	let selectedUser = $state<UserRecord | null>(null);
	let modalOpen = $state(false);
	let targetRole = $state<'user' | 'admin' | 'superadmin'>('user');
	let targetBanned = $state(false);
	let banReason = $state('');
	let updatingUser = $state(false);
	let updateSuccessMsg = $state('');

	$effect(() => {
		if (authStore.user) {
			fetchUsers();
		}
	});

	const fetchUsers = async () => {
		loading = true;
		errorMsg = '';
		try {
			const queryParts: string[] = [];
			if (searchQuery) queryParts.push(`q=${encodeURIComponent(searchQuery)}`);
			if (roleFilter !== 'all') queryParts.push(`role=${encodeURIComponent(roleFilter)}`);
			if (statusFilter !== 'all') queryParts.push(`status=${encodeURIComponent(statusFilter)}`);
			const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';

			const { data } = await apiFetch<{ users: UserRecord[] }>(
				`/api/superadmin/users${queryString}`
			);
			users = data.users;
		} catch (err) {
			console.error('Fetch users error:', err);
			errorMsg = err instanceof Error ? err.message : 'Error loading user list';
		} finally {
			loading = false;
		}
	};

	const openUserModal = (user: UserRecord) => {
		selectedUser = user;
		targetRole = user.role;
		targetBanned = user.isBanned;
		banReason = user.bannedReason || '';
		updateSuccessMsg = '';
		modalOpen = true;
	};

	const closeModal = () => {
		modalOpen = false;
		selectedUser = null;
		updateSuccessMsg = '';
	};

	const handleUpdateUser = async () => {
		if (!selectedUser) return;
		updatingUser = true;
		updateSuccessMsg = '';

		try {
			await apiFetch(`/api/superadmin/users/${selectedUser.uid}`, {
				method: 'PATCH',
				body: {
					role: targetRole,
					isBanned: targetBanned,
					bannedReason: banReason
				}
			});

			updateSuccessMsg = 'User updated successfully!';
			// Refresh list
			await fetchUsers();

			setTimeout(() => {
				closeModal();
			}, 1000);
		} catch (err) {
			console.error('Update user error:', err);
			alert(err instanceof Error ? err.message : 'Failed to update user');
		} finally {
			updatingUser = false;
		}
	};
</script>

<svelte:head>
	<title>User Management &mdash; Super Admin</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<div
				class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-500"
			>
				👥 Account Directory & Control
			</div>
			<h1 class="font-display text-2xl font-black text-text sm:text-3xl">User Management</h1>
			<p class="mt-1 text-xs text-text-muted sm:text-sm">
				View, search, assign administrative roles, or suspend user access across the platform.
			</p>
		</div>
	</div>

	<!-- Filters & Search Toolbar -->
	<div
		class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs md:flex-row md:items-center md:justify-between"
	>
		<!-- Search Input -->
		<div class="relative flex-1">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-text-muted"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<input
				type="text"
				placeholder="Search by name, email, or UID..."
				bind:value={searchQuery}
				onkeydown={(e) => e.key === 'Enter' && fetchUsers()}
				class="w-full rounded-xl border border-border bg-surface-muted py-2 pr-4 pl-10 text-xs font-semibold text-text placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
			/>
		</div>

		<!-- Filter Dropdowns & Apply Button -->
		<div class="flex flex-wrap items-center gap-3">
			<!-- Role Select -->
			<select
				bind:value={roleFilter}
				onchange={fetchUsers}
				class="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-bold text-text focus:border-primary focus:outline-none"
			>
				<option value="all">All Roles</option>
				<option value="user">Student Users</option>
				<option value="admin">Admins</option>
				<option value="superadmin">Super Admins</option>
			</select>

			<!-- Status Select -->
			<select
				bind:value={statusFilter}
				onchange={fetchUsers}
				class="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-bold text-text focus:border-primary focus:outline-none"
			>
				<option value="all">All Statuses</option>
				<option value="active">Active Only</option>
				<option value="banned">Banned / Suspended</option>
			</select>

			<button
				type="button"
				onclick={fetchUsers}
				class="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition-all hover:bg-primary-hover active:scale-95"
			>
				Filter
			</button>
		</div>
	</div>

	<!-- Data Table / User List -->
	{#if loading}
		<div class="flex flex-col gap-3">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{errorMsg}
		</div>
	{:else if users.length === 0}
		<div class="rounded-2xl border border-border bg-surface p-12 text-center shadow-xs">
			<div class="mb-2 text-3xl">🔍</div>
			<h3 class="font-display text-base font-bold text-text">No users found</h3>
			<p class="mt-1 text-xs text-text-muted">
				Try adjusting your search terms or filter selection.
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-2xl border border-border bg-surface shadow-xs">
			<table class="w-full text-left text-xs">
				<thead
					class="border-b border-border bg-surface-muted/60 text-[10px] font-bold tracking-wider text-text-muted uppercase"
				>
					<tr>
						<th class="p-4">User</th>
						<th class="p-4">Role</th>
						<th class="p-4">Status</th>
						<th class="p-4">Streak</th>
						<th class="p-4">Joined</th>
						<th class="p-4 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border/60">
					{#each users as u (u.uid)}
						<tr class="transition-colors hover:bg-surface-muted/40">
							<!-- User Column -->
							<td class="p-4">
								<div class="flex items-center gap-3">
									{#if u.photoURL}
										<img
											src={u.photoURL}
											alt={u.displayName || 'User'}
											class="h-9 w-9 rounded-full border border-border object-cover"
										/>
									{:else}
										<div
											class="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
										>
											{(u.displayName || u.email || 'U').slice(0, 2).toUpperCase()}
										</div>
									{/if}
									<div class="min-w-0">
										<a
											href={resolve(`/superadmin/user-management/${u.uid}` as '/app')}
											class="block truncate font-bold text-text transition-colors hover:text-primary"
										>
											{u.displayName || 'Unnamed User'}
										</a>
										<span class="block max-w-50 truncate text-[11px] text-text-muted">
											{u.email}
										</span>
									</div>
								</div>
							</td>

							<!-- Role Column -->
							<td class="p-4">
								{#if u.role === 'superadmin'}
									<span
										class="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-500"
									>
										👑 Super Admin
									</span>
								{:else if u.role === 'admin'}
									<span
										class="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary"
									>
										🛡️ Admin
									</span>
								{:else}
									<span
										class="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[10px] font-bold text-text-muted"
									>
										Student
									</span>
								{/if}
							</td>

							<!-- Status Column -->
							<td class="p-4">
								{#if u.isBanned}
									<span
										class="rounded-full border border-danger/30 bg-danger-soft px-2.5 py-1 text-[10px] font-bold text-danger"
										title={u.bannedReason || 'Suspended'}
									>
										🚫 Suspended
									</span>
								{:else}
									<span
										class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-500"
									>
										Active
									</span>
								{/if}
							</td>

							<!-- Streak Column -->
							<td class="p-4 font-semibold text-text-muted">
								🔥 {u.streakCurrent || 0}d
							</td>

							<!-- Joined Column -->
							<td class="p-4 text-[11px] font-semibold text-text-muted">
								{new Date(u.createdAt).toLocaleDateString()}
							</td>

							<!-- Actions Column -->
							<td class="p-4 text-right">
								<div class="flex items-center justify-end gap-2">
									<a
										href={resolve(`/superadmin/user-management/${u.uid}` as '/app')}
										class="rounded-lg border border-border bg-surface p-1.5 text-text-muted transition-colors hover:border-primary hover:text-primary"
										title="View User Details"
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
												d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
											/>
										</svg>
									</a>

									<button
										type="button"
										onclick={() => openUserModal(u)}
										class="cursor-pointer rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-xs font-bold text-text transition-colors hover:border-primary hover:text-primary"
									>
										Edit Access
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

<!-- Administrative User Action Modal -->
{#if modalOpen && selectedUser}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
		<div
			class="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-2xl"
		>
			<div class="flex items-center justify-between border-b border-border pb-4">
				<div>
					<h3 class="font-display text-base font-bold text-text">Edit User Privileges</h3>
					<p class="max-w-70 truncate text-xs text-text-muted">
						{selectedUser.displayName || selectedUser.email}
					</p>
				</div>
				<button
					type="button"
					onclick={closeModal}
					class="rounded-lg p-1 text-text-muted hover:text-text"
				>
					✕
				</button>
			</div>

			{#if updateSuccessMsg}
				<div
					class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-500"
				>
					{updateSuccessMsg}
				</div>
			{/if}

			<div class="flex flex-col gap-4">
				<!-- Assign Role -->
				<div class="flex flex-col gap-2">
					<label for="modal-user-role" class="text-xs font-bold tracking-wider text-text uppercase"
						>Access Role</label
					>
					<select
						id="modal-user-role"
						bind:value={targetRole}
						class="rounded-xl border border-border bg-surface-muted p-2.5 text-xs font-bold text-text focus:border-primary focus:outline-none"
					>
						<option value="user">Student User (Standard Access)</option>
						<option value="admin">Administrator (Analytics & Metrics Access)</option>
						<option value="superadmin">Super Administrator (Root Console Access)</option>
					</select>
				</div>

				<!-- Toggle Suspension -->
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
							placeholder="Reason for suspension (optional)..."
							bind:value={banReason}
							class="mt-2 w-full rounded-xl border border-danger/30 bg-danger-soft p-2.5 text-xs font-semibold text-danger placeholder-danger/60 focus:outline-none"
						/>
					{/if}
				</div>
			</div>

			<div class="flex items-center justify-end gap-3 border-t border-border pt-4">
				<button
					type="button"
					onclick={closeModal}
					class="rounded-xl border border-border bg-surface-muted px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleUpdateUser}
					disabled={updatingUser}
					class="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition-all hover:bg-primary-hover disabled:opacity-50"
				>
					{updatingUser ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
		</div>
	</div>
{/if}
