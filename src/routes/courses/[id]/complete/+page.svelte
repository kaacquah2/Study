<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const courseId = $derived(page.params.id);
	const type = $derived(page.url.searchParams.get('type') || 'lesson');
	const finalStreak = $derived(Number(page.url.searchParams.get('streak') || '0'));
	const extended = $derived(page.url.searchParams.get('extended') === 'true');
	const score = $derived(page.url.searchParams.get('score'));
	const total = $derived(page.url.searchParams.get('total'));

	// Count up animation state
	let displayedStreak = $state(0);
	let triggerSpring = $state(false);

	$effect(() => {
		if (finalStreak > 0) {
			if (extended) {
				// Start from streak - 1 and count up
				displayedStreak = finalStreak - 1;
				const t1 = setTimeout(() => {
					displayedStreak = finalStreak;
					triggerSpring = true;
				}, 400);

				return () => clearTimeout(t1);
			} else {
				displayedStreak = finalStreak;
				triggerSpring = true;
			}
		}
	});
</script>

<svelte:head>
	<title>Congratulations! &mdash; AI Study Buddy</title>
</svelte:head>

<AppShell requireAuth={true}>
	<div
		class="mx-auto flex w-full max-w-md grow flex-col items-center justify-center px-6 py-12 select-none"
	>
		<!-- Centered Celebration Container Card -->
		<div
			class="relative flex w-full flex-col items-center gap-6 overflow-hidden rounded-lg border border-border bg-surface p-8 text-center shadow-lg sm:p-10"
		>
			<!-- Subtle decorative background rings -->
			<div
				class="absolute -top-12 -right-12 h-32 w-32 rounded-full border border-accent/10 bg-accent/5"
			></div>
			<div
				class="absolute -bottom-16 -left-16 h-40 w-40 rounded-full border border-primary/5 bg-primary/5"
			></div>

			<!-- Large Streak Badge Block (Orange, Rounded, Spring Animated) -->
			<div
				class="relative flex h-28 w-28 flex-col items-center justify-center rounded-3xl border-4 border-accent-soft bg-accent text-white shadow-lg
               {triggerSpring ? 'animate-spring-scale' : ''} z-10 motion-reduce:transform-none"
			>
				<span class="font-display text-5xl leading-none font-bold tracking-tight">
					{displayedStreak}
				</span>
				<span class="mt-1 block text-[9px] font-bold tracking-widest text-white/95 uppercase">
					Days
				</span>
			</div>

			<!-- Status Caption -->
			<div class="z-10">
				<span
					class="inline-flex items-center rounded-full border border-accent/10 bg-accent-soft px-3 py-1 text-xs font-bold tracking-wider text-accent uppercase"
				>
					{extended ? 'Streak Extended' : 'Streak Safe'}
				</span>
			</div>

			<!-- Heading -->
			<div class="z-10 flex flex-col gap-2">
				<h2
					class="font-display text-2xl leading-tight font-bold tracking-tight text-text sm:text-3xl"
				>
					{type === 'quiz' ? 'Quiz complete!' : 'Lesson complete!'}
				</h2>

				{#if type === 'quiz' && score !== null && total !== null}
					<p
						class="mx-auto inline-block rounded-r-md border border-primary/10 bg-primary-soft/50 px-4 py-2.5 text-sm font-bold text-primary"
					>
						You scored {score} / {total} correct answers
					</p>
				{/if}

				<p class="mt-1 max-w-xs text-xs leading-relaxed text-text-muted sm:text-sm">
					{#if extended}
						Awesome! You studied today &mdash; your streak is now {finalStreak} days. Keep it up tomorrow!
					{:else}
						You already studied today &mdash; your streak of {finalStreak} days is safe. Great job on
						keeping it alive!
					{/if}
				</p>
			</div>

			<!-- Actions Buttons -->
			<div
				class="z-10 flex w-full flex-col gap-3 border-t border-border pt-4 select-none sm:flex-row"
			>
				<a
					href={resolve(`/courses/${courseId}`)}
					class="flex-1 rounded-r-md bg-primary px-4 py-3.5 text-center text-xs font-bold text-white shadow-md transition-all duration-180 hover:bg-primary-hover active:scale-[0.98]"
				>
					Back to course
				</a>
				<a
					href={resolve('/app')}
					class="flex-1 rounded-r-md border border-border bg-surface-muted px-4 py-3.5 text-center text-xs font-bold text-text-muted shadow-sm transition-all duration-180 hover:bg-border hover:text-text"
				>
					Dashboard
				</a>
			</div>
		</div>
	</div>
</AppShell>

<style>
	/* spring scale animation as defined in layout guidelines */
	@keyframes spring {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.12);
		}
		100% {
			transform: scale(1);
		}
	}
	.animate-spring-scale {
		animation: spring 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
	}

	/* Respect user preferred motion */
	@media (prefers-reduced-motion: reduce) {
		.animate-spring-scale {
			animation: none !important;
			transform: none !important;
		}
	}
</style>
