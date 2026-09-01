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

<div class="max-w-3xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Header -->
	<div
		class="gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between flex flex-col border-b border-border"
	>
		<div>
			<a
				href={resolve('/app')}
				class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
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

		<div class="gap-2 flex items-center">
			<button
				type="button"
				onclick={handleExportCSV}
				class="gap-1 px-3 py-1.5 text-xs font-bold shadow-xs inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary"
				title="Export Flashcards to CSV"
			>
				📥 Export CSV
			</button>

			{#if dueQuestions.length > 0}
				<span class="bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400 rounded-full">
					{currentIndex + 1} of {dueQuestions.length}
					{reviewMode === 'due' ? 'due' : 'cards'}
				</span>
			{/if}
		</div>
	</div>

	<!-- Quiz & Deck Selector Toolbar -->
	<div class="gap-4 rounded-2xl p-4 sm:p-5 flex flex-col border border-border bg-surface shadow-sm">
		<div class="flex items-center justify-between">
			<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
				>🎯 Quiz & Deck Selector</span
			>
			{#if totalDueCount > 0}
				<span
					class="bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-400 rounded-full text-[11px]"
				>
					{totalDueCount} Total Due Card{totalDueCount > 1 ? 's' : ''}
				</span>
			{/if}
		</div>

		<div class="gap-3 sm:grid-cols-2 grid grid-cols-1">
			<!-- Course Filter Dropdown -->
			<div class="gap-1 flex flex-col">
				<label for="course-select" class="font-bold text-[11px] text-text-muted"
					>Course Filter:</label
				>
				<select
					id="course-select"
					value={selectedCourseId}
					onchange={handleCourseChange}
					class="px-3 py-2 text-xs font-semibold shadow-xs w-full cursor-pointer rounded-xl border border-border bg-surface-muted text-text transition-colors focus:border-primary focus:outline-none"
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
			<div class="gap-1 flex flex-col">
				<label for="module-select" class="font-bold text-[11px] text-text-muted"
					>Quiz / Module Filter:</label
				>
				<select
					id="module-select"
					value={selectedModuleId}
					onchange={handleModuleChange}
					class="px-3 py-2 text-xs font-semibold shadow-xs w-full cursor-pointer rounded-xl border border-border bg-surface-muted text-text transition-colors focus:border-primary focus:outline-none"
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
		<div class="pt-3 flex items-center justify-between border-t border-border/50">
			<span class="text-xs font-bold text-text-muted">Review Mode:</span>
			<div class="p-1 inline-flex rounded-xl bg-surface-muted">
				<button
					type="button"
					onclick={() => handleModeToggle('due')}
					class="px-3 py-1 text-xs font-bold cursor-pointer rounded-lg transition-all {reviewMode ===
					'due'
						? 'text-white shadow-xs bg-primary'
						: 'text-text-muted hover:text-text'}"
				>
					⏰ Due Today Only
				</button>
				<button
					type="button"
					onclick={() => handleModeToggle('all')}
					class="px-3 py-1 text-xs font-bold cursor-pointer rounded-lg transition-all {reviewMode ===
					'all'
						? 'text-white shadow-xs bg-primary'
						: 'text-text-muted hover:text-text'}"
				>
					🎯 All Quiz Cards (Practice)
				</button>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="gap-4 flex flex-col">
			<Skeleton variant="card" />
			<Skeleton variant="card" />
		</div>
	{:else if errorMsg}
		<div
			class="rounded-2xl p-6 text-xs font-bold border border-danger/20 bg-danger-soft text-center text-danger"
		>
			{errorMsg}
		</div>
	{:else if dueQuestions.length === 0}
		<!-- All Caught Up / Session Complete Screen -->
		<div
			class="gap-5 rounded-3xl p-8 shadow-xs sm:p-12 flex flex-col items-center justify-center border border-border bg-surface text-center"
		>
			<div
				class="h-16 w-16 rounded-2xl bg-emerald-500/20 text-3xl flex items-center justify-center"
			>
				{reviewCount > 0 ? '🏆' : '🎉'}
			</div>
			<div>
				<h2 class="font-display text-xl font-bold sm:text-2xl text-text">
					{reviewCount > 0
						? 'Session Complete!'
						: reviewMode === 'due'
							? 'All Caught Up for Today!'
							: 'No Cards Found'}
				</h2>
				<p class="mt-1.5 max-w-md text-xs leading-relaxed sm:text-sm text-text-muted">
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
				<div class="max-w-md gap-3 grid w-full grid-cols-2">
					<div class="rounded-2xl border-emerald-500/30 bg-emerald-500/10 p-3.5 border text-center">
						<span class="font-bold text-emerald-400 block text-[10px] uppercase"
							>Cards Reviewed</span
						>
						<span class="font-display text-lg font-bold text-emerald-300">{reviewCount}</span>
					</div>
					<div class="rounded-2xl p-3.5 border border-primary/30 bg-primary-soft/40 text-center">
						<span class="font-black block text-[10px] text-primary uppercase">FSRS Status</span>
						<span class="font-display text-lg font-bold text-text">Updated</span>
					</div>
				</div>
			{/if}

			<div class="mt-2 gap-3 flex flex-wrap items-center justify-center">
				{#if reviewMode === 'due'}
					<button
						type="button"
						onclick={() => {
							drillSessionStarted = false;
							handleModeToggle('all');
						}}
						class="rounded-2xl px-5 py-2.5 text-xs font-bold text-white inline-flex cursor-pointer items-center justify-center bg-primary shadow-md hover:bg-primary-hover active:scale-95"
					>
						🎯 Practice All Deck Cards
					</button>
				{/if}
				<a
					href={resolve('/app/knowledge-map')}
					class="rounded-2xl px-5 py-2.5 text-xs font-bold shadow-xs inline-flex items-center justify-center border border-border bg-surface text-text hover:border-primary active:scale-95"
				>
					🗺️ View Knowledge Map
				</a>
				<a
					href={resolve('/app')}
					class="rounded-2xl px-5 py-2.5 text-xs font-bold inline-flex items-center justify-center border border-border bg-surface-muted text-text-muted hover:text-text active:scale-95"
				>
					Return to Dashboard &rarr;
				</a>
			</div>
		</div>
	{:else if dueQuestions.length > 0 && !drillSessionStarted}
		<!-- Pre-Session Memory Drill Briefing Card -->
		<div
			class="gap-6 rounded-3xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
		>
			<div class="gap-2 flex flex-col">
				<div
					class="gap-1.5 border-amber-500/30 bg-amber-500/10 px-3 py-1 font-black tracking-wider text-amber-400 inline-flex items-center self-start rounded-full border text-[10px] uppercase"
				>
					<span>🧠 FSRS Memory Retention Session</span>
				</div>
				<h2 class="font-display text-xl font-bold sm:text-2xl text-text">
					Ready for your spaced repetition drill?
				</h2>
				<p class="text-xs leading-relaxed sm:text-sm text-text-muted">
					Reviewing key questions right before memory decay maximizes long-term recall stability
					with minimum effort.
				</p>
			</div>

			<div class="gap-3 sm:grid-cols-3 grid grid-cols-2">
				<div class="rounded-2xl p-4 border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Cards in Queue</span>
					<span class="font-display text-base font-bold text-text">
						{dueQuestions.length}
						{reviewMode === 'due' ? 'Due Cards' : 'Cards'}
					</span>
				</div>
				<div class="rounded-2xl p-4 border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Estimated Time</span>
					<span class="font-display text-base font-bold text-text">
						~{Math.max(1, Math.ceil(dueQuestions.length * 0.75))} mins
					</span>
				</div>
				<div class="rounded-2xl p-4 sm:col-span-1 col-span-2 border border-border bg-surface-muted">
					<span class="font-bold block text-[10px] text-text-muted uppercase">Algorithm</span>
					<span class="font-display text-base font-bold text-amber-400"> FSRS-4.5 </span>
				</div>
			</div>

			<div class="pt-4 flex items-center justify-between border-t border-border/80">
				<span class="text-xs text-text-muted">Keyboard shortcuts [1], [2], [3], [4] supported</span>
				<button
					type="button"
					onclick={() => (drillSessionStarted = true)}
					class="gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-xs font-bold text-slate-950 hover:bg-amber-400 inline-flex cursor-pointer items-center shadow-md transition-all active:scale-95"
				>
					<span>Start Review Session &rarr;</span>
				</button>
			</div>
		</div>
	{:else if currentQ}
		<!-- Session progress bar -->
		<div class="gap-3 flex items-center">
			<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
				<div
					class="to-emerald-400 h-full rounded-full bg-linear-to-r from-primary transition-all duration-500"
					style="width: {((currentIndex + 1) / dueQuestions.length) * 100}%"
				></div>
			</div>
			<span class="font-bold shrink-0 text-[10px] text-text-muted"
				>{currentIndex + 1}/{dueQuestions.length}</span
			>
		</div>
		<!-- Swipe hint on mobile -->
		{#if isAnswered}
			<p class="font-bold sm:hidden text-center text-[10px] text-text-muted">
				← Swipe left = Hard &nbsp;|&nbsp; Swipe right = Easy →
			</p>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#key cardAnimKey}
			<div
				class="anim-slide-up gap-6 rounded-3xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm {isSwipingLeft
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
				<div class="gap-2 flex flex-wrap items-center justify-between">
					<span
						class="px-3 py-1 font-bold rounded-lg border border-primary/30 bg-primary-soft/60 text-[11px] text-primary"
					>
						📚 {currentQ.courseTitle} &bull; {currentQ.moduleTitle}
					</span>
					<div class="gap-2 flex items-center">
						{#if !currentQ.isDue}
							<span
								class="bg-blue-500/20 px-2.5 py-0.5 font-bold text-blue-400 rounded-full text-[10px]"
							>
								🎯 Practice Card
							</span>
						{:else}
							<span
								class="bg-amber-500/20 px-2.5 py-0.5 font-bold text-amber-400 rounded-full text-[10px]"
							>
								⏰ Scheduled Due
							</span>
						{/if}
						<span class="font-bold text-[11px] text-text-muted">
							Card {currentIndex + 1}/{dueQuestions.length}
						</span>
					</div>
				</div>

				<!-- Question Prompt / Flashcard Front -->
				<h2 class="font-display text-lg leading-snug font-bold sm:text-xl text-text">
					{currentQ.question}
				</h2>

				<!-- MCQ Options OR Flashcard Flip -->
				{#if currentQ.options && currentQ.options.length > 0}
					<div class="gap-3 flex flex-col">
						{#each currentQ.options as option, idx (idx)}
							{@const isCorrect = idx === currentQ.answerIndex}
							{@const isSelected = idx === selectedOption}
							<button
								type="button"
								onclick={() => handleSelectOption(idx)}
								disabled={isAnswered}
								class="rounded-2xl p-4 text-xs font-semibold flex w-full cursor-pointer items-center justify-between border text-left transition-all duration-180 {isAnswered
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
							class="min-h-36 rounded-2xl p-6 shadow-xs flex w-full flex-col justify-between border border-primary/30 bg-surface-muted/30 text-center"
						>
							{#if !isAnswered}
								<div class="text-xs font-bold my-auto text-text-muted">
									Tap "Reveal Answer" below when ready to rate your recall.
								</div>
								<div class="mt-4 flex justify-center">
									<button
										type="button"
										onclick={() => (isAnswered = true)}
										class="px-5 py-2.5 text-xs font-bold text-white rounded-xl bg-primary shadow-md hover:bg-primary-hover active:scale-95"
									>
										🔄 Reveal Answer
									</button>
								</div>
							{:else}
								<div class="text-xs font-bold my-auto text-primary">
									{currentQ.explanation || 'Review completed'}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Explanation & Rating Action (Post-answer) -->
				{#if isAnswered}
					<div class="gap-4 pt-4 flex flex-col border-t border-border/60">
						{#if currentQ.explanation}
							<div
								class="p-4 text-xs rounded-xl border border-border/60 bg-surface-muted/40 text-text-muted"
							>
								💡 <strong>Explanation:</strong>
								{currentQ.explanation}
							</div>
						{/if}

						<!-- FSRS Retention Decay Visualizer -->
						<div
							class="gap-2 rounded-2xl p-4 flex flex-col border border-primary/20 bg-primary-soft/30"
						>
							<div class="text-xs flex items-center justify-between">
								<span class="font-bold text-primary"
									>📈 FSRS Memory Stability & Retention Curve</span
								>
								<span class="font-mono font-bold text-[11px] text-text-muted">
									Stability (S): {currentQ?.intervalDays ? Math.max(1, currentQ.intervalDays) : 3}d
									&bull; Decay: R = e^(-Δt/S)
								</span>
							</div>

							<!-- SVG Retention Curve Graph -->
							<div
								class="h-20 p-2 relative w-full overflow-hidden rounded-xl border border-border/60 bg-surface"
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
									<text x="5" y="16" class="fill-emerald-400 font-bold text-[8px]"
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
									<text x="95" y="24" class="font-bold fill-text text-[9px]"
										>Review Scheduled Point (Today)</text
									>
								</svg>
							</div>
						</div>

						<!-- FSRS Rating Buttons -->
						<div class="gap-2 flex flex-col">
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold text-text-muted uppercase">
									Rate your recall difficulty (FSRS):
								</span>
								<span class="text-[10px] text-text-muted">Press keys [1], [2], [3], or [4]</span>
							</div>
							<div class="gap-2 sm:grid-cols-4 grid grid-cols-2">
								<button
									type="button"
									onclick={() => submitRating(1)}
									class="border-rose-500/40 bg-rose-500/15 py-3 text-xs font-bold text-rose-300 hover:bg-rose-500/30 cursor-pointer rounded-xl border text-center transition-all active:scale-95"
								>
									<div>🔴 [1] Forgot</div>
									<span class="text-[10px] opacity-75">+1 day</span>
								</button>
								<button
									type="button"
									onclick={() => submitRating(2)}
									class="border-amber-500/40 bg-amber-500/15 py-3 text-xs font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer rounded-xl border text-center transition-all active:scale-95"
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
									class="border-blue-500/40 bg-blue-500/15 py-3 text-xs font-bold text-blue-300 hover:bg-blue-500/30 cursor-pointer rounded-xl border text-center transition-all active:scale-95"
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
									class="border-emerald-500/40 bg-emerald-500/15 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 cursor-pointer rounded-xl border text-center transition-all active:scale-95"
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
