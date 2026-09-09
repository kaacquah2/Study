<script lang="ts">
	import { themeStore, type Theme } from '$lib/stores/theme.svelte';

	interface Props {
		fullWidth?: boolean;
		size?: 'sm' | 'md';
		class?: string;
	}

	let { fullWidth = false, size = 'md', class: className = '' }: Props = $props();

	const themes: { id: Theme; label: string }[] = [
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];
</script>

<div
	class="{fullWidth ? 'flex w-full' : 'inline-flex'} rounded-full border border-border bg-surface-muted/90 p-1 shadow-2xs transition-colors {className}"
	role="group"
	aria-label="Theme selector"
>
	{#each themes as { id, label } (id)}
		<button
			type="button"
			aria-label={`Switch to ${label} theme`}
			aria-pressed={themeStore.current === id}
			class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-semibold transition-all duration-180 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 {fullWidth
				? 'flex-1'
				: ''} {size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} {themeStore.current ===
			id
				? 'bg-primary text-white shadow-xs font-bold'
				: 'text-text-muted hover:text-text hover:bg-surface/50'}"
			onclick={() => themeStore.setTheme(id)}
		>
			{#if id === 'light'}
				<!-- Sun Icon -->
				<svg
					class={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
					/>
				</svg>
			{:else}
				<!-- Moon Icon -->
				<svg
					class={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
					/>
				</svg>
			{/if}
			<span>{label}</span>
		</button>
	{/each}
</div>
