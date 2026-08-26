<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import { goto } from '$app/navigation';

	export interface QuizReviewItem {
		order: number;
		prompt: string;
		options: string[];
		correctIndex: number;
		selectedIndex: number | null;
		explanation: string;
		conceptId?: string;
	}

	interface Props {
		title?: string;
		subtitle?: string;
		courseId?: string;
		moduleId?: string;
		streakCount?: number;
		earnedBadges?: string[];
		certificate?: {
			id: string;
			courseTitle: string;
			studentName: string;
			issuedAt: string;
			shareUrl: string;
		};
		nextModuleId?: string;
		nextModuleTitle?: string;
		quizReviewItems?: QuizReviewItem[];
		onContinue: () => void;
		onNextModule?: (nextId: string) => void;
		onShareCertificate?: () => void;
	}

	let {
		title = 'Module Completed!',
		subtitle = 'Great work! You have successfully mastered this material.',
		courseId = '',
		moduleId = '',
		streakCount,
		earnedBadges = [],
		certificate,
		nextModuleId,
		nextModuleTitle,
		quizReviewItems = [],
		onContinue,
		onNextModule,
		onShareCertificate
	}: Props = $props();

	let showQuizReview = $state(false);
	let explanations = $state<Record<number, string>>({});
	let explainingIndex = $state<number | null>(null);
	let isSyncingMissedCards = $state(false);

	let missedItems = $derived(
		quizReviewItems.filter((item) => item.selectedIndex !== item.correctIndex)
	);

	async function fetchExplanation(idx: number, item: QuizReviewItem) {
		explainingIndex = idx;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/quiz/explain', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					question: item.prompt,
					userAnswer: item.selectedIndex !== null ? item.options[item.selectedIndex] : 'Skipped',
					correctAnswer: item.options[item.correctIndex],
					lessonContext: item.explanation
				})
			});
			const data = await res.json();
			if (res.ok && data.explanation) {
				explanations[idx] = data.explanation;
			}
		} catch (err) {
			console.error('Failed to get AI quiz explanation:', err);
		} finally {
			explainingIndex = null;
		}
	}

	// 1-Click Action: Drill Missed Concepts in FSRS (Zero-AI, Concept-Deduplicated)
	async function handleDrillMissedConcepts() {
		if (isSyncingMissedCards || missedItems.length === 0) return;
		isSyncingMissedCards = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const cardsPayload = missedItems.map((item) => ({
				front: item.prompt,
				back: `${item.options[item.correctIndex]}${item.explanation ? `\n\n💡 ${item.explanation}` : ''}`,
				courseId,
				moduleId,
				conceptId: item.conceptId,
				sourceType: 'quiz_miss'
			}));

			const res = await fetch('/api/spaced-repetition', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ cards: cardsPayload })
			});

			if (res.ok) {
				studySessionStore.recordEvent({
					type: 'flashcard_created',
					summary: `Created ${missedItems.length} FSRS cards from missed quiz questions`
				});
				toastStore.success(`Saved ${missedItems.length} concept(s) to FSRS! Launching review...`);
				setTimeout(() => {
					goto(`/app/review?courseId=${courseId}&moduleId=${moduleId}`);
				}, 600);
			} else {
				throw new Error('Failed to sync cards');
			}
		} catch (err) {
			console.error('Drill missed concepts error:', err);
			toastStore.error('Could not save missed concepts to review deck.');
		} finally {
			isSyncingMissedCards = false;
		}
	}
</script>

<div
	class="flex min-h-105 w-full flex-col items-center justify-center rounded-2xl border border-primary/20 bg-linear-to-b from-surface via-surface to-primary-soft/10 p-8 text-center shadow-xl select-none"
>
	<!-- Celebration Graphic -->
	<div
		class="relative mb-6 flex h-20 w-20 animate-bounce items-center justify-center rounded-3xl bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-10 w-10"
		>
			<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
			<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
			<path d="M4 22h16" />
			<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
			<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
			<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
		</svg>
	</div>

	<h2 class="mb-2 font-display text-2xl font-bold text-text sm:text-3xl">{title}</h2>
	<p class="mb-6 max-w-md text-xs text-text-muted sm:text-sm">{subtitle}</p>

	<!-- Streak Badge -->
	{#if streakCount !== undefined && streakCount > 0}
		<div
			class="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-500 shadow-sm"
		>
			<span>🔥 Streak Maintained! {streakCount} Day{streakCount > 1 ? 's' : ''}</span>
		</div>
	{/if}

	<!-- Earned Badges Strip -->
	{#if earnedBadges.length > 0}
		<div class="mb-6 flex flex-col items-center">
			<span class="mb-2 text-[11px] font-bold tracking-wider text-text-muted uppercase"
				>Newly Unlocked Badges</span
			>
			<div class="flex flex-wrap justify-center gap-2">
				{#each earnedBadges as badge (badge)}
					<span
						class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 shadow-xs"
					>
						<span>🏆</span>
						{badge}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 1-Click Missed Concepts FSRS Drill CTA -->
	{#if missedItems.length > 0}
		<div
			class="my-3 flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left shadow-xs"
		>
			<div class="flex items-center gap-3">
				<span class="text-2xl">🧠</span>
				<div>
					<h4 class="font-display text-xs font-bold text-text">Reinforce Missed Concepts</h4>
					<p class="text-[11px] text-text-muted">
						You missed <strong
							>{missedItems.length} question{missedItems.length > 1 ? 's' : ''}</strong
						>. Add them directly to your FSRS review deck.
					</p>
				</div>
			</div>

			<button
				type="button"
				onclick={handleDrillMissedConcepts}
				disabled={isSyncingMissedCards}
				class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-400 active:scale-95 disabled:opacity-50"
			>
				<span>{isSyncingMissedCards ? 'Syncing...' : '🧠 Drill in FSRS &rarr;'}</span>
			</button>
		</div>
	{/if}

	<!-- Quiz End-of-Quiz "Review Your Answers" Breakdown -->
	{#if quizReviewItems.length > 0}
		<div class="my-4 w-full max-w-xl text-left">
			<button
				type="button"
				onclick={() => (showQuizReview = !showQuizReview)}
				class="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-xs font-bold text-text hover:border-primary/50"
			>
				<span class="flex items-center gap-2">
					<span>📋 Review All Answers & Explanations ({quizReviewItems.length} Questions)</span>
				</span>
				<span>{showQuizReview ? '▲ Hide' : '▼ View Review'}</span>
			</button>

			{#if showQuizReview}
				<div
					class="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface-muted/40 p-4"
				>
					{#each quizReviewItems as item, idx (idx)}
						{@const isCorrect = item.selectedIndex === item.correctIndex}
						<div class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-xs">
							<div class="flex items-start justify-between gap-2 font-bold">
								<span class="text-text">Q{idx + 1}: {item.prompt}</span>
								<span
									class="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold {isCorrect
										? 'bg-emerald-500/20 text-emerald-400'
										: 'bg-rose-500/20 text-rose-400'}"
								>
									{isCorrect ? '✓ Correct' : '✗ Incorrect'}
								</span>
							</div>

							<div class="flex flex-col gap-1 text-[11px]">
								<div class="text-text-muted">
									Your Answer: <strong class={isCorrect ? 'text-emerald-400' : 'text-rose-400'}>
										{item.selectedIndex !== null
											? item.options[item.selectedIndex] || 'None'
											: 'Skipped'}
									</strong>
								</div>
								{#if !isCorrect}
									<div class="text-emerald-400">
										Correct Answer: <strong>{item.options[item.correctIndex]}</strong>
									</div>
								{/if}
								{#if item.explanation}
									<div class="mt-1 rounded-md bg-surface-muted p-2 leading-relaxed text-text-muted">
										💡 <em>Explanation:</em>
										{item.explanation}
									</div>
								{/if}
								{#if !isCorrect}
									{#if explanations[idx]}
										<div
											class="mt-1.5 rounded-md border border-primary/30 bg-primary-soft/40 p-2.5 text-xs leading-relaxed text-text"
										>
											<span class="font-bold text-primary">🤖 AI Detailed Mistake Explanation:</span
											>
											<p class="mt-1">{explanations[idx]}</p>
										</div>
									{:else}
										<button
											type="button"
											onclick={() => fetchExplanation(idx, item)}
											disabled={explainingIndex === idx}
											class="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
										>
											<span>💡</span>
											<span
												>{explainingIndex === idx
													? 'Generating Explanation...'
													: 'Explain My Mistake with AI'}</span
											>
										</button>
									{/if}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Certificate Card at 100% Completion -->
	{#if certificate}
		<div
			class="mb-6 w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center shadow-md"
		>
			<div class="mb-2 text-2xl">📜</div>
			<h3 class="font-display text-base font-bold text-text">Certificate of Completion</h3>
			<p class="mt-1 text-xs text-text-muted">
				Awarded to <strong>{certificate.studentName}</strong> for completing
			</p>
			<div class="my-2 font-display text-sm font-black text-primary">{certificate.courseTitle}</div>
			<div class="font-mono text-[10px] text-text-muted">
				{certificate.id} &bull; Issued {certificate.issuedAt.split('T')[0]}
			</div>
		</div>
	{/if}

	<div class="flex flex-col items-center gap-3 sm:flex-row">
		{#if certificate && onShareCertificate}
			<button
				type="button"
				onclick={onShareCertificate}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-xs font-bold text-text hover:border-primary/40 hover:text-primary active:scale-[0.98]"
			>
				<span>🔗 Share Achievement</span>
			</button>
		{/if}

		<!-- Direct 1-Tap CTA for Next Module -->
		{#if nextModuleId && onNextModule}
			<button
				type="button"
				onclick={() => onNextModule(nextModuleId)}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all duration-180 hover:bg-primary-hover active:scale-[0.98]"
			>
				<span>Continue to {nextModuleTitle || 'Next Module'} &rarr;</span>
			</button>
		{:else}
			<button
				type="button"
				onclick={onContinue}
				class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all duration-180 hover:bg-primary-hover active:scale-[0.98]"
			>
				Return to Course Overview &rarr;
			</button>
		{/if}
	</div>
</div>
