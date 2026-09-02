<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		front: string;
		back: string;
		courseId?: string;
		moduleId?: string;
	}

	let { front, back, courseId, moduleId }: Props = $props();

	let isFlipped = $state(false);
	let isSaving = $state(false);
	let isSaved = $state(false);
	let selfRating = $state<'easy' | 'medium' | 'hard' | null>(null);

	const flipCard = () => {
		isFlipped = !isFlipped;
		selfRating = null;
	};

	const handleAddToReview = async (e: MouseEvent) => {
		e.stopPropagation();
		if (isSaved || isSaving) return;
		isSaving = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			if (!idToken) {
				toastStore.warning('Sign in to save flashcards to your review queue');
				return;
			}

			const res = await fetch('/api/spaced-repetition', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					front,
					back,
					courseId: courseId || '',
					moduleId: moduleId || '',
					type: 'flashcard',
					selfRating: selfRating || 'medium'
				})
			});

			if (res.ok) {
				isSaved = true;
				toastStore.success('Added flashcard to Spaced Repetition Queue!');
			} else {
				toastStore.error('Could not save flashcard.');
			}
		} catch (err) {
			console.error('Save flashcard error:', err);
			toastStore.error('Failed to save flashcard');
		} finally {
			isSaving = false;
		}
	};

	const ratingConfig = [
		{
			key: 'easy' as const,
			label: '⭐ Easy',
			cls: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
		},
		{
			key: 'medium' as const,
			label: '😐 Medium',
			cls: 'border-amber-500/60 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
		},
		{
			key: 'hard' as const,
			label: '😰 Hard',
			cls: 'border-rose-500/60 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
		}
	];
</script>

<div
	class="my-6 gap-3 flex flex-col items-center"
	role="region"
	aria-label="Interactive memory flashcard"
>
	<!-- 3D Flip Card -->
	<div
		class="flip-card h-52 max-w-md w-full cursor-pointer"
		onclick={flipCard}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && flipCard()}
		role="button"
		tabindex="0"
		aria-pressed={isFlipped}
		aria-label={isFlipped
			? `Flashcard back showing answer: ${back}. Tap to flip back to question.`
			: `Flashcard front showing question: ${front}. Tap to reveal answer.`}
	>
		<div class="flip-card-inner {isFlipped ? 'is-flipped' : ''}">
			<!-- Front face -->
			<div
				class="flip-card-front rounded-2xl p-5 flex flex-col justify-between border border-primary/30 bg-surface shadow-md"
			>
				<div class="font-bold flex items-center justify-between text-[10px] text-text-muted">
					<span>🎴 Flashcard (Front)</span>
					<span class="text-primary">Tap to flip 🔄</span>
				</div>
				<div
					class="py-2 font-display text-sm font-bold flex flex-1 items-center justify-center text-center text-text"
				>
					{front}
				</div>
				<div class="text-center text-[10px] text-text-muted">Click to reveal answer</div>
			</div>

			<!-- Back face -->
			<div
				class="flip-card-back rounded-2xl p-5 flex flex-col justify-between border border-primary/50 bg-primary-soft/20 shadow-md"
			>
				<div class="font-bold flex items-center justify-between text-[10px] text-text-muted">
					<span>🎴 Flashcard (Back)</span>
					<span class="text-primary/70">Tap to flip back</span>
				</div>
				<div
					class="py-2 font-display text-sm font-bold flex flex-1 items-center justify-center text-center text-primary"
				>
					{back}
				</div>

				<!-- Self-rating buttons -->
				<div
					class="gap-2 pt-1 flex items-center justify-center"
					role="group"
					aria-label="Flashcard difficulty rating"
				>
					{#each ratingConfig as r (r.key)}
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								selfRating = r.key;
							}}
							aria-pressed={selfRating === r.key}
							aria-label={`Rate difficulty: ${r.key}`}
							class="px-2 py-1 font-bold cursor-pointer rounded-lg border text-[10px] transition-all active:scale-90 {selfRating ===
							r.key
								? r.cls + ' scale-105 shadow-sm'
								: 'border-border bg-surface text-text-muted hover:border-border/80'}"
						>
							{r.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Save button (shown after flip) -->
	{#if isFlipped}
		<div
			class="anim-slide-up max-w-md gap-2 px-4 py-2.5 flex w-full items-center justify-between rounded-xl border border-border bg-surface"
			role="status"
			aria-live="polite"
		>
			<span class="text-[11px] text-text-muted">
				{selfRating ? `Rated: ${selfRating}` : 'Rate how well you knew this ↑'}
			</span>
			<button
				type="button"
				onclick={handleAddToReview}
				disabled={isSaved || isSaving}
				aria-label={isSaved
					? 'Flashcard already added to review'
					: 'Save flashcard to Spaced Repetition queue'}
				class="gap-1.5 px-3 py-1.5 font-bold hover:text-white inline-flex cursor-pointer items-center rounded-xl border border-primary/40 bg-primary-soft/60 text-[11px] text-primary transition-all hover:bg-primary active:scale-95 disabled:opacity-50"
			>
				{#if isSaved}
					<span>✓ Added to Review</span>
				{:else if isSaving}
					<span>Saving...</span>
				{:else}
					<span>+ Save to SRS</span>
				{/if}
			</button>
		</div>
	{/if}
</div>
