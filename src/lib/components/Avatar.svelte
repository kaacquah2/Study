<script lang="ts">
	import { User } from '@lucide/svelte';

	interface Props {
		src?: string | null;
		alt?: string;
		name?: string | null;
		initials?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
		shape?: 'circle' | 'rounded';
		class?: string;
		border?: boolean;
	}

	let {
		src = null,
		alt = 'User avatar',
		name = null,
		initials = '',
		size = 'md',
		shape = 'circle',
		class: customClass = '',
		border = true
	}: Props = $props();

	let imageError = $state(false);

	// Reset error if image URL changes
	$effect(() => {
		if (src) {
			imageError = false;
		}
	});

	// Derive display initials
	let computedInitials = $derived.by(() => {
		if (initials && initials !== '??') return initials.toUpperCase().slice(0, 2);

		if (name) {
			const clean = name.trim();
			if (!clean || clean === '??') return '';

			// If it's an email, extract first two characters of handle
			if (clean.includes('@')) {
				const handle = clean.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
				return handle.slice(0, 2).toUpperCase();
			}

			// If multi-word name
			const parts = clean.split(/\s+/).filter(Boolean);
			if (parts.length >= 2) {
				const first = parts[0][0] || '';
				const second = parts[1][0] || '';
				return (first + second).toUpperCase();
			}

			// Single word
			return clean.slice(0, 2).toUpperCase();
		}

		return '';
	});

	// Size classes map
	const sizeClasses: Record<string, string> = {
		xs: 'h-6 w-6 text-[10px]',
		sm: 'h-7 w-7 text-xs',
		md: 'h-8 w-8 text-xs',
		lg: 'h-9 w-9 text-xs',
		xl: 'h-10 w-10 text-sm font-bold',
		'2xl': 'h-16 w-16 text-xl font-black'
	};

	const iconSizes: Record<string, string> = {
		xs: 'h-3 w-3',
		sm: 'h-3.5 w-3.5',
		md: 'h-4 w-4',
		lg: 'h-4.5 w-4.5',
		xl: 'h-5 w-5',
		'2xl': 'h-8 w-8'
	};
</script>

<div
	class="relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none {size !==
	'custom'
		? sizeClasses[size] || sizeClasses.md
		: ''} {shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} {border
		? 'border border-border'
		: ''} {customClass}"
	style="background: var(--primary-soft); color: var(--primary);"
>
	{#if src && !imageError}
		<img
			{src}
			alt={alt || name || 'User profile picture'}
			referrerpolicy="no-referrer"
			loading="lazy"
			class="h-full w-full object-cover {shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}"
			onerror={() => (imageError = true)}
		/>
	{:else if computedInitials}
		<span class="font-bold tracking-tight select-none">{computedInitials}</span>
	{:else}
		<User
			class="{iconSizes[size] || 'h-4 w-4'} opacity-80"
			aria-hidden="true"
		/>
	{/if}
</div>
