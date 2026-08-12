<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';

	interface DeckInfo {
		courseId: string;
		courseTitle: string;
		moduleId: string;
		moduleTitle: string;
		dueCount: number;
		totalCount: number;
	}

	interface DueQuestion {
		courseId: string;
		courseTitle: string;
		moduleId: string;
		moduleTitle: string;
		questionIndex: number;
		question: string;
		options: string[];
		answerIndex: number;
		explanation?: string;
		nextReviewDate?: string;
		intervalDays?: number;
		isDue: boolean;
	}

	let dueQuestions = $state<DueQuestion[]>([]);
	let availableDecks = $state<DeckInfo[]>([]);
	let totalDueCount = $state(0);
	let totalCardsCount = $state(0);
	let loading = $state(true);
	let errorMsg = $state('');
	let currentIndex = $state(0);
	let selectedOption = $state<number | null>(null);
	let isAnswered = $state(false);
	let reviewCount = $state(0);

	// Interactive enhancements
	let cardAnimKey = $state(0);
	let isSwipingLeft = $state(false);
	let isSwipingRight = $state(false);
	let touchStartX = $state(0);

	const handleTouchStart = (e: TouchEvent) => {
		touchStartX = e.touches[0].clientX;
	};

	const handleTouchEnd = (e: TouchEvent) => {
		if (!isAnswered) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (dx < -60) {
			isSwipingLeft = true;
			setTimeout(() => {
				isSwipingLeft = false;
				submitRating(1);
			}, 320);
		} else if (dx > 60) {
			isSwipingRight = true;
			setTimeout(() => {
				isSwipingRight = false;
				submitRating(5);
			}, 320);
		}
	};

	// Filters & Mode
	let selectedCourseId = $state<string>('');
	let selectedModuleId = $state<string>('');
	let reviewMode = $state<'due' | 'all'>('due');

	let currentQ = $derived(dueQuestions[currentIndex] || null);

	// Group unique courses from availableDecks
	let coursesList = $derived.by(() => {
		const coursesMap: Record<
			string,
			{ id: string; title: string; dueCount: number; totalCount: number }
		> = {};
		for (const deck of availableDecks) {
			if (coursesMap[deck.courseId]) {
				coursesMap[deck.courseId].dueCount += deck.dueCount;
				coursesMap[deck.courseId].totalCount += deck.totalCount;
			} else {
				coursesMap[deck.courseId] = {
					id: deck.courseId,
					title: deck.courseTitle,
					dueCount: deck.dueCount,
					totalCount: deck.totalCount
				};
			}
		}
		return Object.values(coursesMap);
	});

	// Filter modules list based on selected course
	let filteredModulesList = $derived.by(() => {
		if (!selectedCourseId) return availableDecks;
		return availableDecks.filter((d) => d.courseId === selectedCourseId);
	});

	async function getToken(): Promise<string> {
		const token = await auth.currentUser?.getIdToken();
		if (!token) throw new Error('Not authenticated');
		return token;
	}

	async function fetchDueReviews() {
		loading = true;
		errorMsg = '';
		try {
			const token = await getToken();
			const queryParts: string[] = [];
			if (selectedCourseId) queryParts.push(`courseId=${encodeURIComponent(selectedCourseId)}`);
			if (selectedModuleId) queryParts.push(`moduleId=${encodeURIComponent(selectedModuleId)}`);
			if (reviewMode) queryParts.push(`mode=${encodeURIComponent(reviewMode)}`);

			const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

			const res = await fetch(`/api/spaced-repetition/due${queryString}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to load review questions');
			const data = await res.json();
			dueQuestions = data.dueQuestions || [];
			availableDecks = data.availableDecks || [];
			totalDueCount = data.totalDueCount ?? data.count ?? 0;
			totalCardsCount = data.totalCardsCount ?? 0;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Error loading reviews';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		selectedCourseId = urlParams.get('courseId') || '';
		selectedModuleId = urlParams.get('moduleId') || '';
		reviewMode = (urlParams.get('mode') as 'due' | 'all') || 'due';

		fetchDueReviews();

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	function handleKeyDown(event: KeyboardEvent) {
		// Shortcuts work when question is answered
		if (!isAnswered || !currentQ) return;
		if (event.key === '1') submitRating(1);
		else if (event.key === '2') submitRating(2);
		else if (event.key === '3') submitRating(3);
		else if (event.key === '4') submitRating(5);
	}

	async function applyFilterChange(
		newCourseId: string,
		newModuleId: string,
		newMode: 'due' | 'all'
	) {
		selectedCourseId = newCourseId;
		selectedModuleId = newModuleId;
		reviewMode = newMode;
		currentIndex = 0;
		selectedOption = null;
		isAnswered = false;

		const queryParts: string[] = [];
		if (selectedCourseId) queryParts.push(`courseId=${encodeURIComponent(selectedCourseId)}`);
		if (selectedModuleId) queryParts.push(`moduleId=${encodeURIComponent(selectedModuleId)}`);
		if (reviewMode !== 'due') queryParts.push(`mode=${encodeURIComponent(reviewMode)}`);

		const queryStr = queryParts.join('&');
		const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
		window.history.replaceState({}, '', newUrl);

		await fetchDueReviews();
	}

	function handleCourseChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		applyFilterChange(val, '', reviewMode);
	}

	function handleModuleChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		applyFilterChange(selectedCourseId, val, reviewMode);
	}

	function handleModeToggle(mode: 'due' | 'all') {
		applyFilterChange(selectedCourseId, selectedModuleId, mode);
	}

	function handleSelectOption(index: number) {
		if (isAnswered) return;
		selectedOption = index;
		isAnswered = true;
	}

	async function submitRating(quality: number) {
		if (!currentQ) return;
		try {
			const token = await getToken();
			const res = await fetch('/api/spaced-repetition/review', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					courseId: currentQ.courseId,
					moduleId: currentQ.moduleId,
					questionIndex: currentQ.questionIndex,
					quality
				})
			});
			if (res.ok) {
				reviewCount += 1;
				toastStore.success('Memory rating saved! FSRS scheduled next review.');
				advanceNext();
			} else {
				toastStore.error('Failed to submit review score.');
			}
		} catch {
			toastStore.error('Network error saving review score.');
		}
	}

	function advanceNext() {
		selectedOption = null;
		isAnswered = false;
		cardAnimKey += 1;
		if (currentIndex < dueQuestions.length - 1) {
			currentIndex += 1;
		} else {
			dueQuestions = [];
		}
	}

	async function handleExportCSV() {
		try {
			const token = await getToken();
			const res = await fetch('/api/spaced-repetition/export?format=csv', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error('Failed to export cards');
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'flashcards.csv';
			a.click();
			window.URL.revokeObjectURL(url);
			toastStore.success('Flashcards exported to CSV!');
		} catch {
			toastStore.error('Export failed');
		}
	}
</script>

<svelte:head>
	<title>Spaced Repetition Review &mdash; AI Study Buddy</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4">
	<!-- Header -->
	<div
		class="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<a
				href={resolve('/app')}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold tracking-tight text-text">
				🧠 Spaced Repetition Drill (FSRS-4.5)
			</h1>
			<p class="text-xs text-text-muted">
				Strengthen long-term memory recall by reviewing cards scheduled for today or practicing any
				quiz deck.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handleExportCSV}
				class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-xs transition-colors hover:border-primary"
				title="Export Flashcards to CSV"
			>
				📥 Export CSV
			</button>

			{#if dueQuestions.length > 0}
				<span class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400">
					{currentIndex + 1} of {dueQuestions.length}
					{reviewMode === 'due' ? 'due' : 'cards'}
				</span>
			{/if}
		</div>
	</div>

	<!-- Quiz & Deck Selector Toolbar -->
	<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
		<div class="flex items-center justify-between">
			<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
				>🎯 Quiz & Deck Selector</span
			>
			{#if totalDueCount > 0}
				<span
					class="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400"
				>
					{totalDueCount} Total Due Card{totalDueCount > 1 ? 's' : ''}
				</span>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<!-- Course Filter Dropdown -->
			<div class="flex flex-col gap-1">
				<label for="course-select" class="text-[11px] font-bold text-text-muted"
					>Course Filter:</label
				>
				<select
					id="course-select"
					value={selectedCourseId}
					onchange={handleCourseChange}
					class="w-full cursor-pointer rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-text shadow-xs transition-colors focus:border-primary focus:outline-none"
				>
					<option value="">🌐 All Courses ({totalDueCount} due / {totalCardsCount} total)</option>
					{#each coursesList as course (course.id)}
						<option value={course.id}>
							📚 {course.title} ({course.dueCount} due / {course.totalCount} total)
						</option>
					{/each}
				</select>
			</div>

			<!-- Quiz Filter Dropdown -->
			<div class="flex flex-col gap-1">
				<label for="module-select" class="text-[11px] font-bold text-text-muted"
					>Quiz / Module Filter:</label
				>
				<select
					id="module-select"
					value={selectedModuleId}
					onchange={handleModuleChange}
					class="w-full cursor-pointer rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-text shadow-xs transition-colors focus:border-primary focus:outline-none"
				>
					<option value="">📝 All Quizzes {selectedCourseId ? 'in Course' : ''}</option>
					{#each filteredModulesList as deck (deck.moduleId)}
						<option value={deck.moduleId}>
							⚡ {deck.moduleTitle} ({deck.dueCount} due / {deck.totalCount} total)
						</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Review Mode Switcher -->
		<div class="flex items-center justify-between border-t border-border/50 pt-3">
			<span class="text-xs font-bold text-text-muted">Review Mode:</span>
			<div class="inline-flex rounded-xl bg-surface-muted p-1">
				<button
					type="button"
					onclick={() => handleModeToggle('due')}
					class="cursor-pointer rounded-lg px-3 py-1 text-xs font-bold transition-all {reviewMode ===
					'due'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
				>
					⏰ Due Today Only
				</button>
				<button
					type="button"
					onclick={() => handleModeToggle('all')}
					class="cursor-pointer rounded-lg px-3 py-1 text-xs font-bold transition-all {reviewMode ===
					'all'
						? 'bg-primary text-white shadow-xs'
						: 'text-text-muted hover:text-text'}"
				>
					🎯 All Quiz Cards (Practice)
				</button>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="flex flex-col gap-4">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div
			class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
		>
			{errorMsg}
		</div>
	{:else if dueQuestions.length === 0}
		<div
			class="flex flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-surface p-12 text-center shadow-xs"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-3xl"
			>
				🎉
			</div>
			<div>
				<h2 class="font-display text-xl font-bold text-text">
					{reviewMode === 'due' ? 'No Due Cards Scheduled for Selected Quiz!' : 'No Cards Found'}
				</h2>
				<p class="mt-1 max-w-md text-xs text-text-muted">
					{#if reviewMode === 'due'}
						Great job! All spaced repetition cards in this deck scheduled for today are complete.
						Switch to
						<strong>Practice Mode</strong> to review all quiz cards on demand.
					{:else}
						No flashcard quiz questions available for the selected filter. Try selecting another
						course or quiz.
					{/if}
				</p>
			</div>

			<div class="mt-2 flex flex-wrap items-center justify-center gap-3">
				{#if reviewMode === 'due'}
					<button
						type="button"
						onclick={() => handleModeToggle('all')}
						class="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-95"
					>
						🎯 Switch to Practice All Cards
					</button>
				{/if}
				{#if selectedCourseId || selectedModuleId}
					<button
						type="button"
						onclick={() => applyFilterChange('', '', 'due')}
						class="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-border bg-surface-muted px-5 py-2.5 text-xs font-bold text-text shadow-xs hover:border-primary active:scale-95"
					>
						🌐 View All Courses & Quizzes
					</button>
				{/if}
				<a
					href={resolve('/app')}
					class="inline-flex items-center justify-center rounded-2xl border border-border bg-surface px-5 py-2.5 text-xs font-bold text-text-muted hover:text-text active:scale-95"
				>
					Return to Dashboard &rarr;
				</a>
			</div>

			{#if reviewCount > 0}
				<div
					class="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400"
				>
					✓ Completed {reviewCount} card review{reviewCount > 1 ? 's' : ''} in this session
				</div>
			{/if}
		</div>
	{:else if currentQ}
		<!-- Session progress bar -->
		<div class="flex items-center gap-3">
			<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
				<div
					class="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
					style="width: {((currentIndex + 1) / dueQuestions.length) * 100}%"
				></div>
			</div>
			<span class="shrink-0 text-[10px] font-bold text-text-muted"
				>{currentIndex + 1}/{dueQuestions.length}</span
			>
		</div>
		<!-- Swipe hint on mobile -->
		{#if isAnswered}
			<p class="text-center text-[10px] font-bold text-text-muted sm:hidden">
				← Swipe left = Hard &nbsp;|&nbsp; Swipe right = Easy →
			</p>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#key cardAnimKey}
			<div
				class="anim-slide-up flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8 {isSwipingLeft
					? 'anim-swipe-left'
					: ''} {isSwipingRight ? 'anim-swipe-right' : ''}"
				ontouchstart={handleTouchStart}
				ontouchend={handleTouchEnd}
				style={isSwipingLeft
					? 'animation: swipe-left-out 0.32s ease both;'
					: isSwipingRight
						? 'animation: swipe-right-out 0.32s ease both;'
						: ''}
			>
				<!-- Context Tag & Status -->
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span
						class="rounded-lg border border-primary/30 bg-primary-soft/60 px-3 py-1 text-[11px] font-bold text-primary"
					>
						📚 {currentQ.courseTitle} &bull; {currentQ.moduleTitle}
					</span>
					<div class="flex items-center gap-2">
						{#if !currentQ.isDue}
							<span
								class="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-400"
							>
								🎯 Practice Card
							</span>
						{:else}
							<span
								class="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-400"
							>
								⏰ Scheduled Due
							</span>
						{/if}
						<span class="text-[11px] font-bold text-text-muted">
							Card {currentIndex + 1}/{dueQuestions.length}
						</span>
					</div>
				</div>

				<!-- Question Prompt / Flashcard Front -->
				<h2 class="font-display text-lg leading-snug font-bold text-text sm:text-xl">
					{currentQ.question}
				</h2>

				<!-- MCQ Options OR Flashcard Flip -->
				{#if currentQ.options && currentQ.options.length > 0}
					<div class="flex flex-col gap-3">
						{#each currentQ.options as option, idx (idx)}
							{@const isCorrect = idx === currentQ.answerIndex}
							{@const isSelected = idx === selectedOption}
							<button
								type="button"
								onclick={() => handleSelectOption(idx)}
								disabled={isAnswered}
								class="flex w-full cursor-pointer items-center justify-between rounded-2xl border p-4 text-left text-xs font-semibold transition-all duration-180 {isAnswered
									? isCorrect
										? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
										: isSelected
											? 'border-danger/60 bg-danger-soft text-danger'
											: 'border-border/40 opacity-50'
									: 'border-border bg-surface hover:border-primary/50 hover:bg-surface-muted'}"
							>
								<span>{option}</span>
								{#if isAnswered}
									{#if isCorrect}
										<span class="text-sm font-bold text-emerald-400">✓ Correct</span>
									{:else if isSelected}
										<span class="text-sm font-bold text-danger">✕ Incorrect</span>
									{/if}
								{/if}
							</button>
						{/each}
					</div>
				{:else}
					<!-- Flashcard flip view -->
					<div class="my-2 flex flex-col items-center">
						<div
							class="flex min-h-36 w-full flex-col justify-between rounded-2xl border border-primary/30 bg-surface-muted/30 p-6 text-center shadow-xs"
						>
							{#if !isAnswered}
								<div class="my-auto text-xs font-bold text-text-muted">
									Tap "Reveal Answer" below when ready to rate your recall.
								</div>
								<div class="mt-4 flex justify-center">
									<button
										type="button"
										onclick={() => (isAnswered = true)}
										class="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-95"
									>
										🔄 Reveal Answer
									</button>
								</div>
							{:else}
								<div class="my-auto text-xs font-bold text-primary">
									{currentQ.explanation || 'Review completed'}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Explanation & Rating Action (Post-answer) -->
				{#if isAnswered}
					<div class="flex flex-col gap-4 border-t border-border/60 pt-4">
						{#if currentQ.explanation}
							<div
								class="rounded-xl border border-border/60 bg-surface-muted/40 p-4 text-xs text-text-muted"
							>
								💡 <strong>Explanation:</strong>
								{currentQ.explanation}
							</div>
						{/if}

						<!-- FSRS Rating Buttons -->
						<div class="flex flex-col gap-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold text-text-muted uppercase">
									Rate your recall difficulty (FSRS):
								</span>
								<span class="text-[10px] text-text-muted">Press [1], [2], [3], or [4]</span>
							</div>
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
								<button
									type="button"
									onclick={() => submitRating(1)}
									class="cursor-pointer rounded-xl border border-rose-500/40 bg-rose-500/15 py-3 text-center text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/30 active:scale-95"
								>
									🔴 [1] Forgot
								</button>
								<button
									type="button"
									onclick={() => submitRating(2)}
									class="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/15 py-3 text-center text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/30 active:scale-95"
								>
									🟠 [2] Hard
								</button>
								<button
									type="button"
									onclick={() => submitRating(3)}
									class="cursor-pointer rounded-xl border border-blue-500/40 bg-blue-500/15 py-3 text-center text-xs font-bold text-blue-300 transition-all hover:bg-blue-500/30 active:scale-95"
								>
									🟢 [3] Good
								</button>
								<button
									type="button"
									onclick={() => submitRating(5)}
									class="cursor-pointer rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-3 text-center text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/30 active:scale-95"
								>
									⚡ [4] Easy
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/key}
	{/if}
</div>
