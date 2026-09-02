<script lang="ts">
	interface Props {
		prompt: string;
		options: string[];
		answerIndex: number;
		explanation: string;
	}

	let { prompt, options, answerIndex, explanation }: Props = $props();

	let selectedIndex = $state<number | null>(null);
	let isLocked = $state(false);
	let showConfetti = $state(false);
	let shakeIndex = $state<number | null>(null);
	let motivationalMsg = $state('');

	const motivationalCorrect = [
		'🎉 Perfect! First try!',
		'✨ Nailed it!',
		"🔥 You're on fire!",
		'💡 Brilliant!'
	];
	const motivationalWrong = [
		'Keep going! Review the explanation 👇',
		'Almost! Check the explanation.',
		'💪 Learn from this one!'
	];

	const handleSelect = (idx: number) => {
		if (isLocked) return;
		selectedIndex = idx;
	};

	const triggerConfetti = () => {
		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			return;
		}
		showConfetti = true;
		setTimeout(() => (showConfetti = false), 900);
	};

	const handleConfirm = () => {
		if (selectedIndex === null || isLocked) return;
		isLocked = true;

		if (selectedIndex === answerIndex) {
			triggerConfetti();
			motivationalMsg = motivationalCorrect[Math.floor(Math.random() * motivationalCorrect.length)];
		} else {
			shakeIndex = selectedIndex;
			setTimeout(() => (shakeIndex = null), 500);
			motivationalMsg = motivationalWrong[Math.floor(Math.random() * motivationalWrong.length)];
		}
	};

	// Generate random confetti particles
	const confettiParticles = Array.from({ length: 12 }, (_, i) => ({
		id: i,
		color: ['#7c74f0', '#34d399', '#f59e0b', '#f87171', '#60a5fa'][i % 5],
		left: `${8 + i * 7.5}%`,
		delay: `${i * 55}ms`,
		size: `${5 + (i % 4) * 2}px`
	}));
</script>

<div
	role="region"
	aria-label="Quick comprehension check"
	class="my-6 rounded-2xl p-4 shadow-xs sm:p-5 relative border border-primary/30 bg-surface-muted/40"
>
	<!-- Confetti burst overlay -->
	{#if showConfetti}
		<div
			class="inset-0 rounded-2xl pointer-events-none absolute overflow-hidden"
			aria-hidden="true"
		>
			{#each confettiParticles as p (p.id)}
				<div
					class="absolute bottom-1/2"
					style="left: {p.left}; animation: confetti-fall 0.85s ease-out {p.delay} both;"
				>
					<div
						style="width: {p.size}; height: {p.size}; background: {p.color}; border-radius: 2px;"
					></div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="gap-2 pb-2 flex items-center border-b border-border/40">
		<span class="p-1 text-xs rounded-lg bg-primary-soft text-primary"
			>⚡ Check Your Understanding</span
		>
	</div>

	<h4 id="inline-check-prompt" class="mt-3 text-xs leading-snug font-bold text-text">{prompt}</h4>

	<div class="mt-3 gap-2 flex flex-col" role="radiogroup" aria-labelledby="inline-check-prompt">
		{#each options as opt, idx (idx)}
			<button
				type="button"
				role="radio"
				aria-checked={selectedIndex === idx}
				aria-disabled={isLocked}
				aria-label={`Option ${String.fromCharCode(65 + idx)}: ${opt}`}
				onclick={() => handleSelect(idx)}
				disabled={isLocked}
				class="p-3 text-xs font-semibold flex cursor-pointer items-center justify-between rounded-xl border text-left transition-all {idx ===
				shakeIndex
					? 'anim-shake'
					: ''} {isLocked
					? idx === answerIndex
						? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
						: idx === selectedIndex
							? 'border-rose-500 bg-rose-500/10 text-rose-600'
							: 'border-border bg-surface text-text-muted opacity-60'
					: selectedIndex === idx
						? 'shadow-xs border-primary bg-primary-soft text-primary'
						: 'border-border bg-surface text-text hover:border-primary/40'}"
			>
				<div class="gap-2.5 flex items-center">
					<span
						class="h-5 w-5 font-bold flex shrink-0 items-center justify-center rounded-md bg-surface-muted text-[10px] text-text-muted"
						aria-hidden="true"
					>
						{String.fromCharCode(65 + idx)}
					</span>
					<span>{opt}</span>
				</div>
				{#if isLocked}
					{#if idx === answerIndex}
						<span class="font-bold text-emerald-500">✓ Correct</span>
					{:else if idx === selectedIndex}
						<span class="font-bold text-rose-500">✗ Incorrect</span>
					{/if}
				{/if}
			</button>
		{/each}
	</div>

	{#if !isLocked}
		<div class="mt-3 flex justify-end">
			<button
				type="button"
				onclick={handleConfirm}
				disabled={selectedIndex === null}
				class="px-4 py-2 text-xs font-bold text-white shadow-xs cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-40"
			>
				Confirm Answer
			</button>
		</div>
	{:else}
		<!-- Motivational message -->
		{#if motivationalMsg}
			<div
				role="status"
				aria-live="polite"
				class="anim-pop mt-3 text-xs font-bold text-center {selectedIndex === answerIndex
					? 'text-emerald-500'
					: 'text-text-muted'}"
			>
				{motivationalMsg}
			</div>
		{/if}
		<!-- Explanation -->
		<div
			class="anim-slide-up mt-3 p-3 text-xs rounded-xl border border-border/60 bg-surface text-text-muted"
		>
			<span class="font-bold text-text">Explanation:</span>
			{explanation}
		</div>
	{/if}
</div>
