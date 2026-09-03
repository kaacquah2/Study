<script lang="ts">
	import { apiFetch } from '$lib/api/client';
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
	let drillSessionStarted = $state(false);

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

	async function fetchDueReviews() {
		loading = true;
		errorMsg = '';
		try {
			const queryParts: string[] = [];
			if (selectedCourseId) queryParts.push(`courseId=${encodeURIComponent(selectedCourseId)}`);
			if (selectedModuleId) queryParts.push(`moduleId=${encodeURIComponent(selectedModuleId)}`);
			if (reviewMode) queryParts.push(`mode=${encodeURIComponent(reviewMode)}`);

			const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

			const { data } = await apiFetch<{
				dueQuestions?: DueQuestion[];
				availableDecks?: DeckInfo[];
				totalDueCount?: number;
				count?: number;
				totalCardsCount?: number;
			}>(`/api/spaced-repetition/due${queryString}`);

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
			await apiFetch('/api/spaced-repetition/review', {
				method: 'POST',
				body: {
					courseId: currentQ.courseId,
					moduleId: currentQ.moduleId,
					questionIndex: currentQ.questionIndex,
					quality
				}
			});
			reviewCount += 1;
			toastStore.success('Memory rating saved! FSRS scheduled next review.');
			advanceNext();
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
			const { data: blob } = await apiFetch<Blob>('/api/spaced-repetition/export?format=csv', {
				responseType: 'blob'
			});
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
		<!-- All Caught Up / Session Complete Screen -->
		<div
			class="flex flex-col items-center justify-center gap-5 rounded-3xl border border-border bg-surface p-8 text-center shadow-xs sm:p-12"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-3xl"
			>
				{reviewCount > 0 ? '🏆' : '🎉'}
			</div>
			<div>
				<h2 class="font-display text-xl font-bold text-text sm:text-2xl">
					{reviewCount > 0
						? 'Session Complete!'
						: reviewMode === 'due'
							? 'All Caught Up for Today!'
							: 'No Cards Found'}
				</h2>
				<p class="mt-1.5 max-w-md text-xs leading-relaxed text-text-muted sm:text-sm">
					{#if reviewCount > 0}
						Awesome work! You reviewed <strong
							>{reviewCount} card{reviewCount > 1 ? 's' : ''}</strong
						>. Your FSRS memory stability ratings have been synchronized to Firestore.
					{:else if reviewMode === 'due'}
						You have no cards due for review right now. All scheduled spaced-repetition questions
						are up to date!
					{:else}
						No quiz cards available for the selected filter. Try selecting another course or quiz.
					{/if}
				</p>
			</div>

			{#if reviewCount > 0}
				<div class="grid w-full max-w-md grid-cols-2 gap-3">
					<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center">
						<span class="block text-[10px] font-bold text-emerald-400 uppercase"
							>Cards Reviewed</span
						>
						<span class="font-display text-lg font-bold text-emerald-300">{reviewCount}</span>
					</div>
					<div class="rounded-2xl border border-primary/30 bg-primary-soft/40 p-3.5 text-center">
						<span class="block text-[10px] font-black text-primary uppercase">FSRS Status</span>
						<span class="font-display text-lg font-bold text-text">Updated</span>
					</div>
				</div>
			{/if}

			<div class="mt-2 flex flex-wrap items-center justify-center gap-3">
				{#if reviewMode === 'due'}
					<button
						type="button"
						onclick={() => {
							drillSessionStarted = false;
							handleModeToggle('all');
						}}
						class="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-primary-hover active:scale-95"
					>
						🎯 Practice All Deck Cards
					</button>
				{/if}
				<a
					href={resolve('/app/knowledge-map')}
					class="inline-flex items-center justify-center rounded-2xl border border-border bg-surface px-5 py-2.5 text-xs font-bold text-text shadow-xs hover:border-primary active:scale-95"
				>
					🗺️ View Knowledge Map
				</a>
				<a
					href={resolve('/app')}
					class="inline-flex items-center justify-center rounded-2xl border border-border bg-surface-muted px-5 py-2.5 text-xs font-bold text-text-muted hover:text-text active:scale-95"
				>
					Return to Dashboard &rarr;
				</a>
			</div>
		</div>
	{:else if dueQuestions.length > 0 && !drillSessionStarted}
		<!-- Pre-Session Memory Drill Briefing Card -->
		<div
			class="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8"
		>
			<div class="flex flex-col gap-2">
				<div
					class="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black tracking-wider text-amber-400 uppercase"
				>
					<span>🧠 FSRS Memory Retention Session</span>
				</div>
				<h2 class="font-display text-xl font-bold text-text sm:text-2xl">
					Ready for your spaced repetition drill?
				</h2>
				<p class="text-xs leading-relaxed text-text-muted sm:text-sm">
					Reviewing key questions right before memory decay maximizes long-term recall stability
					with minimum effort.
				</p>
			</div>

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div class="rounded-2xl border border-border bg-surface-muted p-4">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Cards in Queue</span>
					<span class="font-display text-base font-bold text-text">
						{dueQuestions.length}
						{reviewMode === 'due' ? 'Due Cards' : 'Cards'}
					</span>
				</div>
				<div class="rounded-2xl border border-border bg-surface-muted p-4">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Estimated Time</span>
					<span class="font-display text-base font-bold text-text">
						~{Math.max(1, Math.ceil(dueQuestions.length * 0.75))} mins
					</span>
				</div>
				<div class="col-span-2 rounded-2xl border border-border bg-surface-muted p-4 sm:col-span-1">
					<span class="block text-[10px] font-bold text-text-muted uppercase">Algorithm</span>
					<span class="font-display text-base font-bold text-amber-400"> FSRS-4.5 </span>
				</div>
			</div>

			<div class="flex items-center justify-between border-t border-border/80 pt-4">
				<span class="text-xs text-text-muted">Keyboard shortcuts [1], [2], [3], [4] supported</span>
				<button
					type="button"
					onclick={() => (drillSessionStarted = true)}
					class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-xs font-bold text-slate-950 shadow-md transition-all hover:bg-amber-400 active:scale-95"
				>
					<span>Start Review Session &rarr;</span>
				</button>
			</div>
		</div>
	{:else if currentQ}
		<!-- Session progress bar -->
		<div class="flex items-center gap-3">
			<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
				<div
					class="h-full rounded-full bg-linear-to-r from-primary to-emerald-400 transition-all duration-500"
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

						<!-- FSRS Retention Decay Visualizer -->
						<div
							class="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary-soft/30 p-4"
						>
							<div class="flex items-center justify-between text-xs">
								<span class="font-bold text-primary"
									>📈 FSRS Memory Stability & Retention Curve</span
								>
								<span class="font-mono text-[11px] font-bold text-text-muted">
									Stability (S): {currentQ?.intervalDays ? Math.max(1, currentQ.intervalDays) : 3}d
									&bull; Decay: R = e^(-Δt/S)
								</span>
							</div>

							<!-- SVG Retention Curve Graph -->
							<div
								class="relative h-20 w-full overflow-hidden rounded-xl border border-border/60 bg-surface p-2"
							>
								<svg class="h-full w-full" viewBox="0 0 300 60" preserveAspectRatio="none">
									<!-- Grid lines -->
									<line
										x1="0"
										y1="15"
										x2="300"
										y2="15"
										stroke="currentColor"
										class="text-border/40"
										stroke-dasharray="3 3"
									/>
									<line
										x1="0"
										y1="35"
										x2="300"
										y2="35"
										stroke="currentColor"
										class="text-border/40"
										stroke-dasharray="3 3"
									/>
									<line
										x1="0"
										y1="55"
										x2="300"
										y2="55"
										stroke="currentColor"
										class="text-border/60"
									/>

									<!-- 90% Target Retention Threshold line -->
									<line
										x1="0"
										y1="20"
										x2="300"
										y2="20"
										stroke="currentColor"
										class="text-emerald-500/40"
										stroke-width="1.5"
									/>
									<text x="5" y="16" class="fill-emerald-400 text-[8px] font-bold"
										>90% Target Retention Threshold</text
									>

									<!-- Retention Decay Exponential Curve -->
									<path
										d="M 0,8 Q 100,24 300,52"
										fill="none"
										stroke="currentColor"
										class="text-primary"
										stroke-width="2.5"
									/>

									<!-- Current Review Point Marker -->
									<circle
										cx="85"
										cy="22"
										r="4"
										fill="currentColor"
										class="animate-pulse text-amber-400"
									/>
									<text x="95" y="24" class="fill-text text-[9px] font-bold"
										>Review Scheduled Point (Today)</text
									>
								</svg>
							</div>
						</div>

						<!-- FSRS Rating Buttons -->
						<div class="flex flex-col gap-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold text-text-muted uppercase">
									Rate your recall difficulty (FSRS):
								</span>
								<span class="text-[10px] text-text-muted">Press keys [1], [2], [3], or [4]</span>
							</div>
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
								<button
									type="button"
									onclick={() => submitRating(1)}
									class="cursor-pointer rounded-xl border border-rose-500/40 bg-rose-500/15 py-3 text-center text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/30 active:scale-95"
								>
									<div>🔴 [1] Forgot</div>
									<span class="text-[10px] opacity-75">+1 day</span>
								</button>
								<button
									type="button"
									onclick={() => submitRating(2)}
									class="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/15 py-3 text-center text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/30 active:scale-95"
								>
									<div>🟠 [2] Hard</div>
									<span class="text-[10px] opacity-75"
										>~{Math.max(
											1,
											Math.round(
												(currentQ?.intervalDays ? Math.max(1, currentQ.intervalDays) : 3) * 0.8
											)
										)}d</span
									>
								</button>
								<button
									type="button"
									onclick={() => submitRating(3)}
									class="cursor-pointer rounded-xl border border-blue-500/40 bg-blue-500/15 py-3 text-center text-xs font-bold text-blue-300 transition-all hover:bg-blue-500/30 active:scale-95"
								>
									<div>🟢 [3] Good</div>
									<span class="text-[10px] opacity-75"
										>~{Math.max(
											2,
											Math.round(
												(currentQ?.intervalDays ? Math.max(1, currentQ.intervalDays) : 3) * 2.2
											)
										)}d</span
									>
								</button>
								<button
									type="button"
									onclick={() => submitRating(5)}
									class="cursor-pointer rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-3 text-center text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/30 active:scale-95"
								>
									<div>⚡ [4] Easy</div>
									<span class="text-[10px] opacity-75"
										>~{Math.max(
											4,
											Math.round(
												(currentQ?.intervalDays ? Math.max(1, currentQ.intervalDays) : 3) * 3.8
											)
										)}d</span
									>
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/key}
	{/if}
</div>
