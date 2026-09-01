<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	interface StudyGroup {
		id: string;
		name: string;
		ownerUid: string;
		inviteCode: string;
		courseId?: string | null;
		memberUids: string[];
		createdAt: string;
	}

	let groups = $state<StudyGroup[]>([]);
	let loading = $state(true);

	// Create Group modal
	let showCreateModal = $state(false);
	let newGroupName = $state('');
	let creating = $state(false);

	// Join Group modal
	let showJoinModal = $state(false);
	let inviteCodeInput = $state('');
	let joining = $state(false);

	async function loadGroups() {
		loading = true;
		try {
			const token = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/study-groups', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) {
				const data = await res.json();
				groups = data.groups || [];
			}
		} catch (err) {
			console.error('Failed to load study groups:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadGroups();
	});

	async function handleCreateGroup() {
		if (newGroupName.trim().length < 3) {
			toastStore.error('Group name must be at least 3 characters.');
			return;
		}
		creating = true;
		try {
			const token = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/study-groups', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name: newGroupName })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Failed to create group');
			toastStore.success(`Study group "${data.group.name}" created!`);
			newGroupName = '';
			showCreateModal = false;
			await loadGroups();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Creation failed');
		} finally {
			creating = false;
		}
	}

	async function handleJoinGroup() {
		if (!inviteCodeInput.trim()) {
			toastStore.error('Invite code is required.');
			return;
		}
		joining = true;
		try {
			const token = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/study-groups/join', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ inviteCode: inviteCodeInput })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Failed to join group');
			toastStore.success(data.message || 'Joined group successfully!');
			inviteCodeInput = '';
			showJoinModal = false;
			await loadGroups();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Join failed');
		} finally {
			joining = false;
		}
	}
</script>

<svelte:head>
	<title>Study Groups &mdash; AI Study Buddy</title>
</svelte:head>

<div class="max-w-4xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Header -->
	<div
		class="gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between flex flex-col border-b border-border"
	>
		<div>
			<a
				href={resolve('/app')}
				class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">Peer Study Groups</h1>
			<p class="mt-0.5 text-xs text-text-muted">
				Collaborate with classmates, share course invites, and track group progress.
			</p>
		</div>
		<div class="gap-3 flex items-center">
			<button
				type="button"
				onclick={() => (showJoinModal = true)}
				class="gap-1.5 px-4 py-2.5 text-xs font-bold inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text hover:bg-surface-muted"
			>
				<span>🔑 Join with Code</span>
			</button>
			<button
				type="button"
				onclick={() => (showCreateModal = true)}
				class="gap-1.5 px-4 py-2.5 text-xs font-bold text-white shadow-xs inline-flex cursor-pointer items-center rounded-xl bg-primary hover:bg-primary-hover"
			>
				<span>➕ Create Group</span>
			</button>
		</div>
	</div>

	{#if loading}
		<div class="gap-4 sm:grid-cols-2 grid grid-cols-1">
			<div class="h-32 animate-pulse rounded-2xl bg-surface-muted"></div>
			<div class="h-32 animate-pulse rounded-2xl bg-surface-muted"></div>
		</div>
	{:else if groups.length === 0}
		<div
			class="rounded-3xl p-12 shadow-xs flex flex-col items-center justify-center border border-border bg-surface text-center"
		>
			<div class="mb-3 text-4xl">👥</div>
			<h3 class="font-display text-lg font-bold text-text">No Study Groups Yet</h3>
			<p class="mt-1 max-w-sm text-xs text-text-muted">
				Create a group to study with peers or enter an invite code from a classmate to join an
				existing group.
			</p>
			<div class="mt-6 gap-3 flex">
				<button
					type="button"
					onclick={() => (showJoinModal = true)}
					class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl border border-border text-text hover:bg-surface-muted"
				>
					Join Group
				</button>
				<button
					type="button"
					onclick={() => (showCreateModal = true)}
					class="px-4 py-2 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary hover:bg-primary-hover"
				>
					Create Group
				</button>
			</div>
		</div>
	{:else}
		<div class="gap-4 sm:grid-cols-2 grid grid-cols-1">
			{#each groups as group (group.id)}
				<div
					class="rounded-2xl p-6 shadow-xs flex flex-col justify-between border border-border bg-surface"
				>
					<div>
						<div class="mb-2 flex items-center justify-between">
							<span class="text-xs font-bold text-primary uppercase">Study Group</span>
							<span
								class="px-2.5 py-0.5 font-mono font-bold rounded-full bg-primary-soft text-[10px] text-primary"
							>
								Code: {group.inviteCode}
							</span>
						</div>
						<h3 class="font-display text-lg font-bold text-text">{group.name}</h3>
						<p class="mt-1 text-xs text-text-muted">
							👥 {group.memberUids.length} member{group.memberUids.length > 1 ? 's' : ''}
						</p>
					</div>
					<div
						class="mt-4 pt-3 flex items-center justify-between border-t border-border/50 text-[11px] text-text-muted"
					>
						<span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
						<span class="font-bold text-success">● Active</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Create Group Modal -->
	{#if showCreateModal}
		<div
			class="inset-0 p-4 backdrop-blur-xs fixed z-50 flex items-center justify-center bg-text/30"
		>
			<div
				class="max-w-md gap-4 rounded-3xl p-6 shadow-2xl flex max-h-[90vh] w-full flex-col overflow-y-auto border border-border bg-surface"
			>
				<h3 class="font-display text-lg font-bold text-text">Create Study Group</h3>
				<input
					type="text"
					bind:value={newGroupName}
					placeholder="Group Name (e.g. Operating Systems Study Circle)..."
					class="p-3 text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<div class="gap-3 pt-2 flex justify-end">
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl border border-border text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleCreateGroup}
						disabled={creating || newGroupName.trim().length < 3}
						class="px-4 py-2 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50"
					>
						{creating ? 'Creating...' : 'Create Group'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Join Group Modal -->
	{#if showJoinModal}
		<div
			class="inset-0 p-4 backdrop-blur-xs fixed z-50 flex items-center justify-center bg-text/30"
		>
			<div
				class="max-w-md gap-4 rounded-3xl p-6 shadow-2xl flex max-h-[90vh] w-full flex-col overflow-y-auto border border-border bg-surface"
			>
				<h3 class="font-display text-lg font-bold text-text">Join Study Group</h3>
				<input
					type="text"
					bind:value={inviteCodeInput}
					placeholder="Enter 6-character Invite Code (e.g. AB12CD)..."
					class="p-3 font-mono text-sm w-full rounded-xl border border-border bg-surface-muted text-text uppercase focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<div class="gap-3 pt-2 flex justify-end">
					<button
						type="button"
						onclick={() => (showJoinModal = false)}
						class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl border border-border text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleJoinGroup}
						disabled={joining || !inviteCodeInput.trim()}
						class="px-4 py-2 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50"
					>
						{joining ? 'Joining...' : 'Join Group'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
