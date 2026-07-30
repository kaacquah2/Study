<script lang="ts">
	interface Props {
		shareId: string;
		title: string;
		description: string;
		sharedByName: string;
		importCount?: number;
		isOfficial?: boolean;
		level?: 'beginner' | 'intermediate' | 'advanced';
		tags?: string[];
		moduleCount?: number;
		onImport: (shareId: string) => void;
		loading?: boolean;
	}

	let {
		shareId,
		title,
		description,
		sharedByName,
		importCount = 0,
		isOfficial = false,
		level = 'intermediate',
		tags = [],
		moduleCount = 4,
		onImport,
		loading = false
	}: Props = $props();

	let levelBadge = $derived.by(() => {
		switch (level) {
			case 'beginner':
				return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
			case 'advanced':
				return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
			case 'intermediate':
			default:
				return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
		}
	});
</script>

<div
	class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md"
>
	<div>
		<!-- Level badge, Official badge & import count -->
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-1.5">
				{#if isOfficial}
					<span
						class="rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-amber-500 uppercase"
					>
						⭐ Official
					</span>
				{/if}
				<span
					class="rounded-lg border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase {levelBadge}"
				>
					{level}
				</span>
			</div>
			<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
					/>
				</svg>
				{importCount}
				{importCount === 1 ? 'person has' : 'people have'} taken this
			</span>
		</div>

		<!-- Title & Creator -->
		<h3 class="mb-1 line-clamp-1 font-display text-base font-bold text-text">{title}</h3>
		<p class="mb-3 text-[11px] font-semibold text-text-muted">Created by {sharedByName}</p>

		<!-- Description -->
		<p class="mb-4 line-clamp-2 text-xs leading-relaxed text-text-muted">{description}</p>

		<!-- Tags -->
		{#if tags.length > 0}
			<div class="mb-4 flex flex-wrap gap-1.5">
				{#each tags.slice(0, 3) as tag (tag)}
					<span
						class="rounded-md border border-border/40 bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted"
					>
						#{tag}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Action Footer -->
	<div class="mt-2 flex items-center justify-between border-t border-border/40 pt-4">
		<span class="text-xs font-bold text-text-muted">{moduleCount} Modules</span>
		<button
			type="button"
			onclick={() => onImport(shareId)}
			disabled={loading}
			class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs transition-all duration-180 hover:bg-primary-hover active:scale-95 disabled:opacity-50"
		>
			{#if loading}
				<span
					class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
				></span>
				Importing...
			{:else}
				<span>Import Course</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M12 4v16m8-8H4"
					/>
				</svg>
			{/if}
		</button>
	</div>
</div>
