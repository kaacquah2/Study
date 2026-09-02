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
		onImport: (shareId: string) => void | Promise<void>;
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
	class="rounded-2xl p-6 flex flex-col justify-between border border-border bg-surface shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md"
>
	<div>
		<!-- Level badge, Official badge & import count -->
		<div class="mb-3 flex items-center justify-between">
			<div class="gap-1.5 flex items-center">
				{#if isOfficial}
					<span
						class="border-amber-500/30 bg-amber-500/15 px-2.5 py-1 font-black tracking-wider text-amber-500 rounded-lg border text-[10px] uppercase"
					>
						⭐ Official
					</span>
				{/if}
				<span
					class="px-2.5 py-1 font-bold tracking-wider rounded-lg border text-[10px] uppercase {levelBadge}"
				>
					{level}
				</span>
			</div>
			<span class="gap-1 font-semibold inline-flex items-center text-[11px] text-text-muted">
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
		<h3 class="mb-1 font-display text-base font-bold line-clamp-1 text-text">{title}</h3>
		<p class="mb-3 font-semibold text-[11px] text-text-muted">Created by {sharedByName}</p>

		<!-- Description -->
		<p class="mb-4 text-xs leading-relaxed line-clamp-2 text-text-muted">{description}</p>

		<!-- Tags -->
		{#if tags.length > 0}
			<div class="mb-4 gap-1.5 flex flex-wrap">
				{#each tags.slice(0, 3) as tag (tag)}
					<span
						class="px-2 py-0.5 font-semibold rounded-md border border-border/40 bg-surface-muted text-[10px] text-text-muted"
					>
						#{tag}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Action Footer -->
	<div class="mt-2 pt-4 flex items-center justify-between border-t border-border/40">
		<span class="text-xs font-bold text-text-muted">{moduleCount} Modules</span>
		<button
			type="button"
			onclick={() => onImport(shareId)}
			disabled={loading}
			aria-label={`Import course: ${title}`}
			class="gap-1.5 px-4 py-2 text-xs font-bold text-white shadow-xs inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary transition-all duration-180 hover:bg-primary-hover active:scale-95 disabled:opacity-50"
		>
			{#if loading}
				<span
					class="h-3.5 w-3.5 animate-spin border-white rounded-full border-2 border-t-transparent"
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
					aria-hidden="true"
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
