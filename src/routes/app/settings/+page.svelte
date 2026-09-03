<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import StreakHeatmap from '$lib/components/StreakHeatmap.svelte';
	import BadgeStrip from '$lib/components/BadgeStrip.svelte';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { apiFetch } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';

	let displayName = $derived(
		authStore.user?.displayName || authStore.profile?.displayName || 'Student'
	);
	let email = $derived(authStore.user?.email || authStore.profile?.email || 'No email provided');
	let photoURL = $derived(authStore.user?.photoURL || authStore.profile?.photoURL);
	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.longestStreak ?? authStore.profile?.streak?.longest ?? currentStreak
	);
	let lastStudiedOn = $derived(authStore.profile?.streak?.lastStudiedOn);
	let userBadges = $derived(authStore.profile?.badges ?? []);

	let initials = $derived.by(() => {
		if (displayName && displayName !== 'Student') {
			return displayName
				.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
		}
		if (email) {
			return email.slice(0, 2).toUpperCase();
		}
		return '??';
	});

	let exporting = $state(false);
	let deleting = $state(false);
	let showDeleteModal = $state(false);

	async function handleExportData() {
		exporting = true;
		try {
			const { data: blob } = await apiFetch<Blob>('/api/user/export', {
				responseType: 'blob'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `study_buddy_export_${Date.now()}.json`;
			a.click();
			URL.revokeObjectURL(url);
			toastStore.success('User data exported successfully!');
		} catch {
			toastStore.error('Data export failed.');
		} finally {
			exporting = false;
		}
	}

	async function handleDeleteAccount() {
		deleting = true;
		try {
			await apiFetch('/api/user/delete-account', {
				method: 'POST'
			});
			toastStore.success('Account successfully deleted.');
			await authStore.logout();
		} catch {
			toastStore.error('Failed to delete account.');
		} finally {
			deleting = false;
			showDeleteModal = false;
		}
	}
</script>

<svelte:head>
	<title>Profile &amp; Settings &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
	<!-- Profile Header Banner -->
	<div
		class="flex flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:p-8"
	>
		<div class="flex items-center gap-5">
			{#if photoURL}
				<img
					src={photoURL}
					alt={displayName}
					class="h-16 w-16 rounded-2xl border-2 border-primary/20 object-cover shadow-md"
				/>
			{:else}
				<div
					class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-xl font-black text-primary shadow-inner"
				>
					{initials}
				</div>
			{/if}

			<div>
				<h1 class="font-display text-xl font-bold text-text sm:text-2xl">{displayName}</h1>
				<p class="mt-0.5 text-xs text-text-muted sm:text-sm">{email}</p>
				<div
					class="mt-2.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft/60 px-3 py-0.5 text-[11px] font-semibold text-primary"
				>
					<span>🔥 Current Streak: {currentStreak} {currentStreak === 1 ? 'day' : 'days'}</span>
				</div>
			</div>
		</div>

		<button
			type="button"
			onclick={() => authStore.logout()}
			class="inline-flex cursor-pointer items-center justify-center gap-2 self-stretch rounded-2xl bg-danger-soft px-5 py-2.5 text-xs font-bold text-danger transition-all duration-180 hover:bg-danger/15 active:scale-95 sm:self-auto"
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
					d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
				/>
			</svg>
			<span>Sign out</span>
		</button>
	</div>

	<!-- Streak & Activity Overview -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>⚡</span>
				<span>Streak Statistics</span>
			</h3>
			<div class="grid grid-cols-2 gap-4">
				<div class="rounded-2xl border border-border/50 bg-surface-muted p-4">
					<span class="block text-[11px] font-semibold tracking-wider text-text-muted uppercase"
						>Current Streak</span
					>
					<span class="mt-1 block text-2xl font-black text-primary"
						>{currentStreak} <span class="text-xs font-semibold">days</span></span
					>
				</div>
				<div class="rounded-2xl border border-border/50 bg-surface-muted p-4">
					<span class="block text-[11px] font-semibold tracking-wider text-text-muted uppercase"
						>Longest Streak</span
					>
					<span class="mt-1 block text-2xl font-black text-text"
						>{longestStreak} <span class="text-xs font-semibold">days</span></span
					>
				</div>
			</div>
			{#if lastStudiedOn}
				<p class="text-xs text-text-muted">
					Last study activity recorded on <span class="font-semibold text-text"
						>{new Date(lastStudiedOn).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span
					>.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>🎨</span>
				<span>Appearance & Preferences</span>
			</h3>
			<div
				class="flex items-center justify-between rounded-2xl border border-border/50 bg-surface-muted p-4"
			>
				<div>
					<span class="block text-xs font-bold text-text">Theme Preference</span>
					<span class="block text-[11px] text-text-muted"
						>Switch between light, dark, or system mode</span
					>
				</div>
				<ThemeSwitcher />
			</div>
		</div>
	</div>

	<!-- Activity Calendar Heatmap -->
	<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
		<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
			<span>📅</span>
			<span>Study Activity History</span>
		</h3>
		<StreakHeatmap />
	</div>

	<!-- Achievements & Badges -->
	<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
				<span>🏆</span>
				<span>Unlocked Achievements</span>
			</h3>
			<span class="text-xs font-semibold text-text-muted">{userBadges.length} of 5 badges</span>
		</div>
		<BadgeStrip badges={userBadges} />
	</div>

	<!-- Data & Privacy (GDPR/CCPA Compliance) -->
	<div class="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
		<h3 class="flex items-center gap-2 font-display text-base font-bold text-text">
			<span>🛡️</span>
			<span>Data & Privacy Controls</span>
		</h3>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<span class="block text-xs font-bold text-text">Export Study Data</span>
				<span class="block text-[11px] text-text-muted"
					>Download a complete JSON export of your progress, courses, and quiz attempts</span
				>
			</div>
			<button
				type="button"
				onclick={handleExportData}
				disabled={exporting}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-2.5 text-xs font-bold text-text hover:bg-surface-muted disabled:opacity-50"
			>
				<span>📥</span>
				<span>{exporting ? 'Exporting...' : 'Export JSON Data'}</span>
			</button>
		</div>

		<hr class="border-border/50" />

		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<span class="block text-xs font-bold text-danger">Delete Account & Data</span>
				<span class="block text-[11px] text-text-muted"
					>Permanently delete your profile, generated courses, and progress metrics</span
				>
			</div>
			<button
				type="button"
				onclick={() => (showDeleteModal = true)}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-danger-soft px-5 py-2.5 text-xs font-bold text-danger hover:bg-danger/20"
			>
				<span>🗑️</span>
				<span>Delete Account</span>
			</button>
		</div>
	</div>

	{#if showDeleteModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4 backdrop-blur-xs"
		>
			<div
				class="flex max-h-[90vh] max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-danger/30 bg-surface p-6 shadow-2xl"
			>
				<h3 class="font-display text-lg font-bold text-danger">Confirm Account Deletion</h3>
				<p class="text-xs leading-relaxed text-text-muted">
					This action is permanent and cannot be undone. All your generated courses, custom RAG
					documents, quiz attempts, and spaced repetition cards will be purged.
				</p>
				<div class="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onclick={() => (showDeleteModal = false)}
						class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleDeleteAccount}
						disabled={deleting}
						class="cursor-pointer rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
					>
						{deleting ? 'Deleting...' : 'Yes, Delete Everything'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
