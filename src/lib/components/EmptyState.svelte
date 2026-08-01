<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Suggestion {
		label: string;
		topic: string;
	}

	interface Props {
		title: string;
		description: string;
		actionLabel?: string;
		onAction?: () => void;
		secondaryActionLabel?: string;
		secondaryActionHref?: string;
		onSecondaryAction?: () => void;
		suggestions?: Suggestion[];
		onSelectSuggestion?: (topic: string) => void;
		icon?: Snippet;
	}

	let {
		title,
		description,
		actionLabel,
		onAction,
		secondaryActionLabel,
		secondaryActionHref,
		onSecondaryAction,
		suggestions = [],
		onSelectSuggestion,
		icon
	}: Props = $props();
</script>

<div
	class="flex min-h-75 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center shadow-xs"
>
	<div
		class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-xs"
		aria-hidden="true"
	>
		{#if icon}
			{@render icon()}
		{:else}
			<!-- Graduation Cap / Book Icon -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-7 w-7"
			>
				<path d="M22 10v6M2 10l10-5 10 5-10 5z" />
				<path d="M6 12v5c3 3 9 3 12 0v-5" />
			</svg>
		{/if}
	</div>

	<h3 class="mb-1.5 font-display text-lg font-bold text-text">{title}</h3>
	<p class="mb-5 max-w-md text-xs leading-relaxed text-text-muted">{description}</p>

	{#if suggestions.length > 0}
		<div class="mb-6 flex flex-col items-center gap-2">
			<span class="text-[11px] font-bold tracking-wider text-text-muted uppercase"
				>Need inspiration? Try:</span
			>
			<div class="flex flex-wrap items-center justify-center gap-2">
				{#each suggestions as s (s.topic)}
					<button
						type="button"
						onclick={() => (onSelectSuggestion ? onSelectSuggestion(s.topic) : null)}
						class="cursor-pointer rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-2xs transition-all hover:border-primary hover:bg-primary-soft/40 hover:text-primary active:scale-95"
					>
						✨ {s.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="flex flex-col items-center gap-3 sm:flex-row">
		{#if actionLabel && onAction}
			<button
				type="button"
				onclick={onAction}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
			>
				{actionLabel}
			</button>
		{/if}

		{#if secondaryActionLabel}
			{#if secondaryActionHref}
				<a
					href={secondaryActionHref}
					class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text shadow-2xs transition-all duration-180 hover:border-primary/40 hover:bg-primary-soft/30 hover:text-primary active:scale-[0.98]"
				>
					<span>🔍</span>
					<span>{secondaryActionLabel}</span>
				</a>
			{:else if onSecondaryAction}
				<button
					type="button"
					onclick={onSecondaryAction}
					class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text shadow-2xs transition-all duration-180 hover:border-primary/40 hover:bg-primary-soft/30 hover:text-primary active:scale-[0.98]"
				>
					<span>🔍</span>
					<span>{secondaryActionLabel}</span>
				</button>
			{/if}
		{/if}
	</div>
</div>
