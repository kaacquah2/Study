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

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
	<!-- Header -->
	<div
		class="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<a
				href={resolve('/app')}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">Peer Study Groups</h1>
			<p class="mt-0.5 text-xs text-text-muted">
				Collaborate with classmates, share course invites, and track group progress.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => (showJoinModal = true)}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text hover:bg-surface-muted"
			>
				<span>🔑 Join with Code</span>
			</button>
			<button
				type="button"
				onclick={() => (showCreateModal = true)}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover"
			>
				<span>➕ Create Group</span>
			</button>
		</div>
	</div>

	{#if loading}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="h-32 animate-pulse rounded-2xl bg-surface-muted"></div>
			<div class="h-32 animate-pulse rounded-2xl bg-surface-muted"></div>
		</div>
	{:else if groups.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
		>
			<div class="mb-3 text-4xl">👥</div>
			<h3 class="font-display text-lg font-bold text-text">No Study Groups Yet</h3>
			<p class="mt-1 max-w-sm text-xs text-text-muted">
				Create a group to study with peers or enter an invite code from a classmate to join an
				existing group.
			</p>
			<div class="mt-6 flex gap-3">
				<button
					type="button"
					onclick={() => (showJoinModal = true)}
					class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text hover:bg-surface-muted"
				>
					Join Group
				</button>
				<button
					type="button"
					onclick={() => (showCreateModal = true)}
					class="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover"
				>
					Create Group
				</button>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each groups as group (group.id)}
				<div
					class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs"
				>
					<div>
						<div class="mb-2 flex items-center justify-between">
							<span class="text-xs font-bold text-primary uppercase">Study Group</span>
							<span
								class="rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-[10px] font-bold text-primary"
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
						class="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-[11px] text-text-muted"
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
			class="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4 backdrop-blur-xs"
		>
			<div
				class="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-2xl"
			>
				<h3 class="font-display text-lg font-bold text-text">Create Study Group</h3>
				<input
					type="text"
					bind:value={newGroupName}
					placeholder="Group Name (e.g. Operating Systems Study Circle)..."
					class="w-full rounded-xl border border-border bg-surface-muted p-3 text-xs text-text focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleCreateGroup}
						disabled={creating || newGroupName.trim().length < 3}
						class="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50"
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
			class="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4 backdrop-blur-xs"
		>
			<div
				class="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-2xl"
			>
				<h3 class="font-display text-lg font-bold text-text">Join Study Group</h3>
				<input
					type="text"
					bind:value={inviteCodeInput}
					placeholder="Enter 6-character Invite Code (e.g. AB12CD)..."
					class="w-full rounded-xl border border-border bg-surface-muted p-3 font-mono text-sm text-text uppercase focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => (showJoinModal = false)}
						class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleJoinGroup}
						disabled={joining || !inviteCodeInput.trim()}
						class="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50"
					>
						{joining ? 'Joining...' : 'Join Group'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
