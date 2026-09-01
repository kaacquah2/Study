<script lang="ts">
	import { auth } from '$lib/firebase/client';
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
			const idToken = await auth.currentUser?.getIdToken();
			const queryParts: string[] = [];
			if (searchQuery) queryParts.push(`q=${encodeURIComponent(searchQuery)}`);
			if (roleFilter !== 'all') queryParts.push(`role=${encodeURIComponent(roleFilter)}`);
			if (statusFilter !== 'all') queryParts.push(`status=${encodeURIComponent(statusFilter)}`);
			const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';

			const res = await fetch(`/api/superadmin/users${queryString}`, {
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Failed to fetch users');
			}

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
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/superadmin/users/${selectedUser.uid}`, {
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
				throw new Error(data.error?.message || 'Failed to update user');
			}

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

<div class="gap-6 flex w-full flex-col">
	<!-- Header -->
	<div class="gap-4 sm:flex-row sm:items-center flex flex-col justify-between">
		<div>
			<div
				class="mb-2 gap-1.5 border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-500 inline-flex items-center rounded-full border"
			>
				👥 Account Directory & Control
			</div>
			<h1 class="font-display text-2xl font-black sm:text-3xl text-text">User Management</h1>
			<p class="mt-1 text-xs sm:text-sm text-text-muted">
				View, search, assign administrative roles, or suspend user access across the platform.
			</p>
		</div>
	</div>

	<!-- Filters & Search Toolbar -->
	<div
		class="gap-4 rounded-2xl p-4 shadow-xs md:flex-row md:items-center md:justify-between flex flex-col border border-border bg-surface"
	>
		<!-- Search Input -->
		<div class="relative flex-1">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="left-3.5 h-4 w-4 absolute top-1/2 -translate-y-1/2 text-text-muted"
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
				class="py-2 pr-4 pl-10 text-xs font-semibold w-full rounded-xl border border-border bg-surface-muted text-text placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
			/>
		</div>

		<!-- Filter Dropdowns & Apply Button -->
		<div class="gap-3 flex flex-wrap items-center">
			<!-- Role Select -->
			<select
				bind:value={roleFilter}
				onchange={fetchUsers}
				class="px-3 py-2 text-xs font-bold rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
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
				class="px-3 py-2 text-xs font-bold rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
			>
				<option value="all">All Statuses</option>
				<option value="active">Active Only</option>
				<option value="banned">Banned / Suspended</option>
			</select>

			<button
				type="button"
				onclick={fetchUsers}
				class="px-4 py-2 text-xs font-bold text-white rounded-xl bg-primary transition-all hover:bg-primary-hover active:scale-95"
			>
				Filter
			</button>
		</div>
	</div>

	<!-- Data Table / User List -->
	{#if loading}
		<div class="gap-3 flex flex-col">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div
			class="rounded-2xl p-6 text-xs font-bold border border-danger/20 bg-danger-soft text-center text-danger"
		>
			{errorMsg}
		</div>
	{:else if users.length === 0}
		<div class="rounded-2xl p-12 shadow-xs border border-border bg-surface text-center">
			<div class="mb-2 text-3xl">🔍</div>
			<h3 class="font-display text-base font-bold text-text">No users found</h3>
			<p class="mt-1 text-xs text-text-muted">
				Try adjusting your search terms or filter selection.
			</p>
		</div>
	{:else}
		<div class="rounded-2xl shadow-xs overflow-x-auto border border-border bg-surface">
			<table class="text-xs w-full text-left">
				<thead
					class="font-bold tracking-wider border-b border-border bg-surface-muted/60 text-[10px] text-text-muted uppercase"
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
								<div class="gap-3 flex items-center">
									{#if u.photoURL}
										<img
											src={u.photoURL}
											alt={u.displayName || 'User'}
											class="h-9 w-9 rounded-full border border-border object-cover"
										/>
									{:else}
										<div
											class="h-9 w-9 text-xs font-bold flex items-center justify-center rounded-full bg-primary-soft text-primary"
										>
											{(u.displayName || u.email || 'U').slice(0, 2).toUpperCase()}
										</div>
									{/if}
									<div class="min-w-0">
										<a
											href={resolve(`/superadmin/user-management/${u.uid}` as '/app')}
											class="font-bold block truncate text-text transition-colors hover:text-primary"
										>
											{u.displayName || 'Unnamed User'}
										</a>
										<span class="max-w-50 block truncate text-[11px] text-text-muted">
											{u.email}
										</span>
									</div>
								</div>
							</td>

							<!-- Role Column -->
							<td class="p-4">
								{#if u.role === 'superadmin'}
									<span
										class="border-violet-500/30 bg-violet-500/10 px-2.5 py-1 font-bold text-violet-500 rounded-full border text-[10px]"
									>
										👑 Super Admin
									</span>
								{:else if u.role === 'admin'}
									<span
										class="px-2.5 py-1 font-bold rounded-full border border-primary/30 bg-primary-soft text-[10px] text-primary"
									>
										🛡️ Admin
									</span>
								{:else}
									<span
										class="px-2.5 py-1 font-bold rounded-full border border-border bg-surface-muted text-[10px] text-text-muted"
									>
										Student
									</span>
								{/if}
							</td>

							<!-- Status Column -->
							<td class="p-4">
								{#if u.isBanned}
									<span
										class="px-2.5 py-1 font-bold rounded-full border border-danger/30 bg-danger-soft text-[10px] text-danger"
										title={u.bannedReason || 'Suspended'}
									>
										🚫 Suspended
									</span>
								{:else}
									<span
										class="border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-500 rounded-full border text-[10px]"
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
							<td class="p-4 font-semibold text-[11px] text-text-muted">
								{new Date(u.createdAt).toLocaleDateString()}
							</td>

							<!-- Actions Column -->
							<td class="p-4 text-right">
								<div class="gap-2 flex items-center justify-end">
									<a
										href={resolve(`/superadmin/user-management/${u.uid}` as '/app')}
										class="p-1.5 rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary"
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
										class="px-2.5 py-1 text-xs font-bold cursor-pointer rounded-lg border border-border bg-surface-muted text-text transition-colors hover:border-primary hover:text-primary"
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
	<div class="inset-0 bg-black/60 p-4 backdrop-blur-xs fixed z-50 flex items-center justify-center">
		<div
			class="max-w-md gap-6 rounded-2xl p-6 shadow-2xl flex w-full flex-col border border-border bg-surface"
		>
			<div class="pb-4 flex items-center justify-between border-b border-border">
				<div>
					<h3 class="font-display text-base font-bold text-text">Edit User Privileges</h3>
					<p class="max-w-70 text-xs truncate text-text-muted">
						{selectedUser.displayName || selectedUser.email}
					</p>
				</div>
				<button
					type="button"
					onclick={closeModal}
					class="p-1 rounded-lg text-text-muted hover:text-text"
				>
					✕
				</button>
			</div>

			{#if updateSuccessMsg}
				<div
					class="border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-500 rounded-xl border text-center"
				>
					{updateSuccessMsg}
				</div>
			{/if}

			<div class="gap-4 flex flex-col">
				<!-- Assign Role -->
				<div class="gap-2 flex flex-col">
					<label for="modal-user-role" class="text-xs font-bold tracking-wider text-text uppercase"
						>Access Role</label
					>
					<select
						id="modal-user-role"
						bind:value={targetRole}
						class="p-2.5 text-xs font-bold rounded-xl border border-border bg-surface-muted text-text focus:border-primary focus:outline-none"
					>
						<option value="user">Student User (Standard Access)</option>
						<option value="admin">Administrator (Analytics & Metrics Access)</option>
						<option value="superadmin">Super Administrator (Root Console Access)</option>
					</select>
				</div>

				<!-- Toggle Suspension -->
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
							placeholder="Reason for suspension (optional)..."
							bind:value={banReason}
							class="mt-2 p-2.5 text-xs font-semibold w-full rounded-xl border border-danger/30 bg-danger-soft text-danger placeholder-danger/60 focus:outline-none"
						/>
					{/if}
				</div>
			</div>

			<div class="gap-3 pt-4 flex items-center justify-end border-t border-border">
				<button
					type="button"
					onclick={closeModal}
					class="px-4 py-2 text-xs font-bold rounded-xl border border-border bg-surface-muted text-text-muted hover:text-text"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleUpdateUser}
					disabled={updatingUser}
					class="px-4 py-2 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover disabled:opacity-50"
				>
					{updatingUser ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
		</div>
	</div>
{/if}
