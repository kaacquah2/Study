<script lang="ts">
	import DraftOutlineEditor from '$lib/components/DraftOutlineEditor.svelte';
	import { auth } from '$lib/firebase/client';
	import { goto } from '$app/navigation';
	import { resolveRoute } from '$app/paths';
	import { page } from '$app/state';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { apiFetch } from '$lib/api/client';

	interface DraftOutlineResponse {
		courseId: string;
		outline: {
			title: string;
			description: string;
			modules: ModuleItem[];
		};
		_status?: number;
		queued?: boolean;
		message?: string;
		jobId?: string;
	}

	interface QueueStatusResponse {
		status: 'completed' | 'failed' | 'processing';
		courseId?: string;
		errorMessage?: string;
	}

	interface ModuleItem {
		id?: string;
		order: number;
		type: 'lesson' | 'quiz';
		title: string;
		summary: string;
	}

	// Wizard Step (1: Topic & Notes, 2: Preferences, 3: Draft Outline Review)
	let step = $state<1 | 2 | 3>(1);

	// Form Inputs
	let topic = $state('');
	let referenceText = $state('');
	let level = $state<'beginner' | 'intermediate' | 'advanced'>('intermediate');
	let goal = $state<string>('curiosity');
	let format = $state<'lessons_and_quizzes' | 'quizzes_only'>('lessons_and_quizzes');
	let moduleCount = $state<number>(4);
	let userManuallySetModules = $state(false);

	// Enhancer AI state
	let isEnhancing = $state(false);
	let enhancedSuggestions = $state<string[]>([]);

	// Draft restoration state
	let hasRestoredDraft = $state(false);

	// Step 3 Draft State
	let draftCourseId = $state<string>('');
	let draftTitle = $state<string>('');
	let draftDescription = $state<string>('');
	let draftModules = $state<ModuleItem[]>([]);

	// Status & Validation
	let loading = $state(false);
	let topicError = $state('');
	let errorMsg = $state('');

	const topicSuggestions = [
		{ label: 'Data Structures', value: 'Data Structures and Algorithms in C++' },
		{ label: 'Operating Systems', value: 'Operating System Memory Management & Page Tables' },
		{ label: 'Computer Networks', value: 'TCP/IP Protocol Suite and Socket Programming' },
		{ label: 'Database Systems', value: 'Relational Database Design, SQL, and 3NF Normalization' },
		{ label: 'Computer Architecture', value: 'RISC vs CISC CPU Architecture & Memory Hierarchy' },
		{ label: 'Discrete Mathematics', value: 'Discrete Math: Propositional Logic and Graph Theory' }
	];

	let examStyleMode = $state<boolean>(false);

	// Restore Wizard State from LocalStorage on mount
	$effect(() => {
		const queryTopic = page.url.searchParams.get('topic');
		if (queryTopic) {
			topic = queryTopic;
			return;
		}

		try {
			const saved = localStorage.getItem('wizard_draft_state');
			if (saved) {
				const parsed = JSON.parse(saved);
				if (parsed.topic) topic = parsed.topic;
				if (parsed.referenceText) referenceText = parsed.referenceText;
				if (parsed.level) level = parsed.level;
				if (parsed.goal) goal = parsed.goal;
				if (parsed.format) format = parsed.format;
				if (parsed.moduleCount) moduleCount = parsed.moduleCount;
				if (parsed.step) step = parsed.step;
				if (parsed.draftCourseId) draftCourseId = parsed.draftCourseId;
				if (parsed.draftTitle) draftTitle = parsed.draftTitle;
				if (parsed.draftDescription) draftDescription = parsed.draftDescription;
				if (parsed.draftModules) draftModules = parsed.draftModules;
				hasRestoredDraft = true;
			}
		} catch (e) {
			console.warn('Failed to restore wizard state:', e);
		}
	});

	// Auto-save Wizard State to LocalStorage
	$effect(() => {
		if (topic || referenceText || draftCourseId) {
			const data = {
				step,
				topic,
				referenceText,
				level,
				goal,
				format,
				moduleCount,
				draftCourseId,
				draftTitle,
				draftDescription,
				draftModules
			};
			localStorage.setItem('wizard_draft_state', JSON.stringify(data));
		}
	});

	const clearSavedWizardState = () => {
		localStorage.removeItem('wizard_draft_state');
		topic = '';
		referenceText = '';
		step = 1;
		draftCourseId = '';
		hasRestoredDraft = false;
		toastStore.info('Wizard draft reset.');
	};

	// Topic Quality & Hints Derivation
	let topicQuality = $derived.by(() => {
		const trimmed = topic.trim();
		if (!trimmed) return 'empty';
		const words = trimmed.split(/\s+/).length;
		if (words === 1 && trimmed.length < 10) return 'vague';
		if (words >= 3 && trimmed.length > 20) return 'specific';
		return 'moderate';
	});

	// Smart Defaults based on Goal (Item #3)
	const handleGoalChange = (newGoal: string) => {
		goal = newGoal;
		if (!userManuallySetModules) {
			if (newGoal === 'exam prep') moduleCount = 6;
			else if (newGoal === 'job skill') moduleCount = 5;
			else if (newGoal === 'curiosity') moduleCount = 3;
		}
	};

	// Enhance Topic AI pass (Item #1)
	const handleEnhanceTopic = async () => {
		if (!topic.trim() || isEnhancing) return;
		isEnhancing = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/courses/enhance-topic', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ topic: topic.trim() })
			});

			const data = await res.json();
			if (res.ok && data.enhancedTopic) {
				topic = data.enhancedTopic;
				enhancedSuggestions = data.suggestions || [];
				toastStore.success('Topic enhanced with AI details!');
			} else {
				throw new Error(data.error?.message || 'Could not enhance topic');
			}
		} catch (e) {
			console.error('Enhance topic error:', e);
			toastStore.error('Could not enhance topic automatically.');
		} finally {
			isEnhancing = false;
		}
	};

	const handleFileUpload = (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
			toastStore.error('Only .txt and .md reference files are supported.');
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			referenceText = reader.result as string;
			toastStore.success(`Uploaded ${file.name}`);
		};
		reader.readAsText(file);
	};

	const validateStep1 = () => {
		const trimmed = topic.trim();
		if (!trimmed) {
			topicError = 'Topic is required.';
			return false;
		} else if (trimmed.length < 3) {
			topicError = 'Topic must be at least 3 characters.';
			return false;
		} else if (trimmed.length > 120) {
			topicError = 'Topic must be less than 120 characters.';
			return false;
		}
		topicError = '';
		return true;
	};

	const goToStep2 = () => {
		if (validateStep1()) {
			step = 2;
		}
	};

	let loadingProgressStep = $state(0);
	let loadingTimer: ReturnType<typeof setInterval> | null = null;

	const startLoadingProgress = () => {
		loadingProgressStep = 0;
		if (loadingTimer) clearInterval(loadingTimer);
		loadingTimer = setInterval(() => {
			if (loadingProgressStep < 3) {
				loadingProgressStep += 1;
			}
		}, 2500);
	};

	const stopLoadingProgress = () => {
		if (loadingTimer) {
			clearInterval(loadingTimer);
			loadingTimer = null;
		}
		loadingProgressStep = 3;
	};

	// Generate Draft Outline (Transition Step 2 -> Step 3)
	const generateDraftOutline = async () => {
		if (loading) return;
		loading = true;
		errorMsg = '';
		startLoadingProgress();

		try {
			const result = await apiFetch<DraftOutlineResponse>('/api/courses', {
				method: 'POST',
				body: {
					topic: topic.trim(),
					moduleCount,
					format,
					referenceText: referenceText.trim() || undefined,
					level,
					goal
				}
			});

			if (result._status === 202 || result.queued) {
				toastStore.info(
					result.message ||
						'Course generation queued due to high demand. Processing in background...'
				);
				// Poll job status until completed
				const jobId = result.jobId;
				let attempts = 0;
				const pollInterval = setInterval(async () => {
					attempts += 1;
					try {
						const jobData = await apiFetch<QueueStatusResponse>(`/api/courses/queue/${jobId}`);
						if (jobData.status === 'completed' && jobData.courseId) {
							clearInterval(pollInterval);
							stopLoadingProgress();
							loading = false;
							toastStore.success('Background course generation completed!');
							const targetUrl = resolveRoute('/app/courses/[id]', { id: jobData.courseId });
							goto(targetUrl);
							return;
						} else if (jobData.status === 'failed') {
							clearInterval(pollInterval);
							stopLoadingProgress();
							loading = false;
							toastStore.error(jobData.errorMessage || 'Background course generation failed.');
							return;
						}
					} catch {
						// Continue polling up to 60 attempts (5 minutes)
					}
					if (attempts >= 60) {
						clearInterval(pollInterval);
						stopLoadingProgress();
						loading = false;
						toastStore.warning(
							'Generation taking longer than expected. Check your dashboard shortly.'
						);
					}
				}, 5000);
				return;
			}
			draftCourseId = result.courseId;
			draftTitle = result.outline.title;
			draftDescription = result.outline.description;
			draftModules = result.outline.modules.map(
				(m: { order: number; type: 'lesson' | 'quiz'; title: string; summary: string }) => ({
					order: m.order,
					type: m.type,
					title: m.title,
					summary: m.summary
				})
			);

			stopLoadingProgress();
			step = 3;
			toastStore.success('Draft outline generated! You can now review and customize your modules.');
		} catch (err) {
			console.error('Error generating draft outline:', err);
			const message = err instanceof Error ? err.message : '';
			errorMsg = message || 'Failed to generate outline. Please check your network connection.';
			toastStore.error(errorMsg);
			stopLoadingProgress();
		} finally {
			loading = false;
		}
	};

	// Save Draft Edits to API
	const handleSaveDraft = async (data: {
		title: string;
		description: string;
		modules: ModuleItem[];
	}) => {
		const idToken = await auth.currentUser?.getIdToken();

		const res = await fetch(`/api/courses/${draftCourseId}/draft`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${idToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				title: data.title,
				description: data.description,
				level,
				modules: data.modules
			})
		});

		if (!res.ok) {
			const errJson = await res.json();
			throw new Error(errJson.error?.message || 'Failed to update draft');
		}
	};

	// Confirm & Start Full Course Generation
	const handleConfirmAndGenerate = async () => {
		try {
			const idToken = await auth.currentUser?.getIdToken();

			const confirmRes = await fetch(`/api/courses/${draftCourseId}/draft`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			if (!confirmRes.ok) {
				throw new Error('Failed to confirm course draft');
			}

			// Clear saved wizard draft upon confirmation
			localStorage.removeItem('wizard_draft_state');

			toastStore.success('Course generation started! Module 1 will be ready in seconds.');
			goto(`/app/courses/${draftCourseId}`);
		} catch (err) {
			console.error('Error confirming course:', err);
			toastStore.error('Failed to confirm course. Please try again.');
		}
	};
</script>

<svelte:head>
	<title>Create Course Wizard &mdash; AI Study Buddy</title>
</svelte:head>

<div class="max-w-3xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Top Stepper Indicator -->
	<div class="pb-4 flex items-center justify-between border-b border-border">
		<div>
			<a
				href="/app"
				class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">Create AI Course</h1>
		</div>

		<!-- Step Progress Badges -->
		<div class="gap-2 flex items-center">
			<span
				class="h-7 w-7 text-xs font-bold flex items-center justify-center rounded-full {step >= 1
					? 'text-white bg-primary'
					: 'bg-surface-muted text-text-muted'}">1</span
			>
			<div class="h-0.5 w-6 bg-border"></div>
			<span
				class="h-7 w-7 text-xs font-bold flex items-center justify-center rounded-full {step >= 2
					? 'text-white bg-primary'
					: 'bg-surface-muted text-text-muted'}">2</span
			>
			<div class="h-0.5 w-6 bg-border"></div>
			<span
				class="h-7 w-7 text-xs font-bold flex items-center justify-center rounded-full {step >= 3
					? 'text-white bg-primary'
					: 'bg-surface-muted text-text-muted'}">3</span
			>
		</div>
	</div>

	{#if hasRestoredDraft && (topic || referenceText)}
		<div
			class="rounded-2xl border-indigo-500/30 bg-indigo-500/10 p-4 text-xs font-semibold text-indigo-300 flex items-center justify-between border"
		>
			<div class="gap-2 flex items-center">
				<span>📝 Resumed your previous course wizard draft.</span>
			</div>
			<button
				type="button"
				onclick={clearSavedWizardState}
				class="font-bold text-indigo-300 hover:text-white cursor-pointer underline"
			>
				Reset & Start Fresh
			</button>
		</div>
	{/if}

	{#if errorMsg}
		<div
			class="p-4 text-xs font-bold rounded-xl border border-danger/20 bg-danger-soft text-danger"
		>
			{errorMsg}
		</div>
	{/if}

	<!-- STEP 1: Topic & Notes -->
	{#if step === 1}
		<div
			class="gap-6 rounded-2xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
		>
			<div>
				<h2 class="font-display text-lg font-bold text-text">Step 1: Choose a Subject</h2>
				<p class="text-xs text-text-muted">
					Enter any topic or paste study materials to generate tailored lessons.
				</p>
			</div>

			<!-- Topic Input & Real-time Hint -->
			<div class="gap-2 flex flex-col">
				<div class="flex items-center justify-between">
					<label
						for="topic-input"
						class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Course Subject / Topic</label
					>

					<!-- Topic Quality Badge -->
					{#if topicQuality === 'vague'}
						<span
							class="bg-amber-500/20 px-2 py-0.5 font-bold text-amber-400 rounded-full text-[10px]"
						>
							⚠️ Vague Topic &mdash; Consider adding specific focus
						</span>
					{:else if topicQuality === 'specific'}
						<span
							class="bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-400 rounded-full text-[10px]"
						>
							✓ Highly Specific Topic &mdash; Great quality expected
						</span>
					{/if}
				</div>

				<div class="gap-2 flex">
					<input
						id="topic-input"
						type="text"
						bind:value={topic}
						onblur={validateStep1}
						placeholder="e.g., Quantum Computing Fundamentals, Microeconomics"
						class="px-4 py-3 text-sm font-semibold grow rounded-xl border bg-surface text-text transition-colors {topicError
							? 'border-danger'
							: 'border-border'} focus:border-primary focus:outline-none"
					/>

					<!-- AI Enhance Button (Item #1) -->
					<button
						type="button"
						onclick={handleEnhanceTopic}
						disabled={isEnhancing || !topic.trim()}
						title="Use AI to automatically expand your topic into a detailed course subject"
						class="gap-1.5 px-4 py-3 text-xs font-bold shadow-xs hover:text-white inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-primary/40 bg-primary-soft/80 text-primary transition-all hover:bg-primary active:scale-95 disabled:opacity-40"
					>
						{#if isEnhancing}
							<span
								class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
							></span>
							<span>Enhancing...</span>
						{:else}
							<span>✨ Enhance Topic</span>
						{/if}
					</button>
				</div>

				{#if topicError}
					<span class="font-semibold text-[11px] text-danger">{topicError}</span>
				{/if}

				<!-- Real-time Hint Nudge Box -->
				<div
					class="p-3 leading-relaxed rounded-xl border border-border/60 bg-surface-muted/40 text-[11px] text-text-muted"
				>
					💡 <strong>Pro Tip:</strong> More specific topics generate dramatically higher quality
					outlines.<br />
					<em>Example:</em> Typing
					<span class="font-mono text-text">"Python for backend web APIs with FastAPI"</span>
					yields much better modules than simply <span class="font-mono text-text">"Python"</span>.
				</div>
			</div>

			<!-- Suggestion Chips -->
			<div class="gap-2 flex flex-col">
				<span class="font-bold text-[11px] text-text-muted uppercase">Need inspiration?</span>
				<div class="gap-2 flex flex-wrap">
					{#each enhancedSuggestions.length > 0 ? enhancedSuggestions : topicSuggestions.map((s) => s.value) as sug (sug)}
						<button
							type="button"
							onclick={() => {
								topic = sug;
								validateStep1();
							}}
							class="px-3 py-1.5 text-xs font-semibold cursor-pointer rounded-xl border border-border bg-surface-muted/50 text-text transition-colors hover:border-primary hover:bg-primary-soft/30"
						>
							{sug}
						</button>
					{/each}
				</div>
			</div>

			<!-- Optional Notes / Reference Text -->
			<div class="gap-2 pt-2 flex flex-col border-t border-border/40">
				<div class="flex items-center justify-between">
					<label
						for="notes-input"
						class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Pasted Notes / Context (Optional)</label
					>
					<label class="font-bold cursor-pointer text-[11px] text-primary hover:underline">
						Upload .txt or .md
						<input type="file" accept=".txt,.md" class="hidden" onchange={handleFileUpload} />
					</label>
				</div>
				<textarea
					id="notes-input"
					bind:value={referenceText}
					rows="4"
					placeholder="Paste syllabus, textbook excerpts, or custom notes here to anchor the AI generation..."
					class="px-4 py-3 text-xs leading-relaxed w-full resize-none rounded-xl border border-border bg-surface text-text focus:border-primary focus:outline-none"
				></textarea>
			</div>

			<!-- Step 1 Next Action -->
			<div class="pt-4 flex justify-end">
				<button
					type="button"
					onclick={goToStep2}
					class="gap-2 px-6 py-3 text-xs font-bold text-white inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20 hover:bg-primary-hover active:scale-98"
				>
					<span>Continue to Preferences &rarr;</span>
				</button>
			</div>
		</div>

		<!-- STEP 2: Preferences -->
	{:else if step === 2}
		<div
			class="gap-6 rounded-2xl p-6 sm:p-8 flex flex-col border border-border bg-surface shadow-sm"
		>
			<div>
				<h2 class="font-display text-lg font-bold text-text">Step 2: Learning Preferences</h2>
				<p class="text-xs text-text-muted">
					Customize the depth, difficulty, and format of your course.
				</p>
			</div>

			<!-- Skill Level -->
			<div class="gap-2 flex flex-col">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
					>Target Skill Level</span
				>
				<div class="gap-2.5 sm:grid-cols-3 sm:gap-3 grid grid-cols-1">
					{#each ['beginner', 'intermediate', 'advanced'] as lvl (lvl)}
						<button
							type="button"
							onclick={() => (level = lvl as 'beginner' | 'intermediate' | 'advanced')}
							class="p-3 text-xs font-bold cursor-pointer rounded-xl border text-center capitalize transition-all {level ===
							lvl
								? 'shadow-xs border-primary bg-primary-soft text-primary'
								: 'border-border bg-surface text-text-muted hover:border-border/80'}"
						>
							{lvl}
						</button>
					{/each}
				</div>
			</div>

			<!-- Primary Goal with Smart Defaults (Item #3) -->
			<div class="gap-2 flex flex-col">
				<span class="text-xs font-bold tracking-wider text-text-muted uppercase">Primary Goal</span>
				<div class="gap-2.5 sm:grid-cols-3 sm:gap-3 grid grid-cols-1">
					{#each [{ label: 'Exam Prep', val: 'exam prep' }, { label: 'Job Skill', val: 'job skill' }, { label: 'Curiosity', val: 'curiosity' }] as g (g.val)}
						<button
							type="button"
							onclick={() => handleGoalChange(g.val)}
							class="p-3 text-xs font-bold cursor-pointer rounded-xl border text-center transition-all {goal ===
							g.val
								? 'shadow-xs border-primary bg-primary-soft text-primary'
								: 'border-border bg-surface text-text-muted hover:border-border/80'}"
						>
							{g.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Format & Module Count -->
			<div class="gap-4 pt-2 sm:grid-cols-2 grid grid-cols-1">
				<!-- Format -->
				<div class="gap-2 flex flex-col">
					<span class="text-xs font-bold tracking-wider text-text-muted uppercase"
						>Course Format</span
					>
					<div class="p-1 flex rounded-xl border border-border bg-surface-muted">
						<button
							type="button"
							onclick={() => (format = 'lessons_and_quizzes')}
							class="py-2 font-bold flex-1 rounded-lg text-[11px] transition-all {format ===
							'lessons_and_quizzes'
								? 'shadow-xs bg-surface text-text'
								: 'text-text-muted'}"
						>
							Lessons & Quizzes
						</button>
						<button
							type="button"
							onclick={() => (format = 'quizzes_only')}
							class="py-2 font-bold flex-1 rounded-lg text-[11px] transition-all {format ===
							'quizzes_only'
								? 'shadow-xs bg-surface text-text'
								: 'text-text-muted'}"
						>
							Quizzes Only
						</button>
					</div>
				</div>

				<!-- Module Count -->
				<div class="gap-2 flex flex-col">
					<div class="text-xs font-bold flex justify-between">
						<span class="tracking-wider text-text-muted uppercase">Module Count</span>
						<span class="text-primary">{moduleCount} Modules</span>
					</div>
					<input
						type="range"
						min="3"
						max="6"
						bind:value={moduleCount}
						oninput={() => (userManuallySetModules = true)}
						class="mt-2 w-full cursor-pointer accent-primary"
					/>
					<span class="font-medium text-[10px] text-text-muted">
						{#if goal === 'exam prep'}
							💡 Exam Prep goal pre-selected 6 modules for thorough practice.
						{:else if goal === 'curiosity'}
							💡 Curiosity goal pre-selected 3 modules for fast reading.
						{:else}
							💡 Job Skill goal pre-selected 5 modules for practical depth.
						{/if}
					</span>
				</div>
			</div>

			<!-- Past Exam Style Mode Toggle -->
			<div
				class="p-4 flex items-center justify-between rounded-xl border border-border/80 bg-surface-muted/30"
			>
				<div class="gap-0.5 flex flex-col">
					<span class="text-xs font-bold text-text">Past Exam Style Mode</span>
					<span class="text-[11px] text-text-muted">
						Generate quiz questions structured like university and standardized past papers.
					</span>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={examStyleMode}
					aria-label="Toggle Past Exam Style Mode"
					onclick={() => (examStyleMode = !examStyleMode)}
					class="h-6 w-11 ease-in-out relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none {examStyleMode
						? 'bg-primary'
						: 'bg-border'}"
				>
					<span
						class="h-5 w-5 bg-white ease-in-out pointer-events-none inline-block transform rounded-full shadow-sm ring-0 transition duration-200 {examStyleMode
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>

			{#if loading}
				<div
					class="gap-3 rounded-2xl p-5 shadow-xs flex flex-col border border-primary/30 bg-primary-soft/10"
				>
					<div class="flex items-center justify-between">
						<div class="gap-2.5 flex items-center">
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
							></span>
							<span class="font-display text-xs font-bold text-text"
								>Generating Course Outline...</span
							>
						</div>
						<span class="text-xs font-bold text-primary"
							>{Math.min(100, (loadingProgressStep + 1) * 25)}%</span
						>
					</div>
					<div class="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
						<div
							class="h-full rounded-full bg-primary transition-all duration-700"
							style="width: {Math.min(100, (loadingProgressStep + 1) * 25)}%"
						></div>
					</div>
					<div class="gap-1.5 pt-1 flex flex-col">
						{#each ['Analyzing topic & reference materials...', 'Structuring curriculum layout & module hierarchy...', 'Generating learning objectives & key points...', 'Finalizing course draft outline...'] as stepLabel, idx (idx)}
							<div
								class="gap-2 text-xs font-semibold flex items-center {idx <= loadingProgressStep
									? 'text-primary'
									: 'text-text-muted/40'}"
							>
								{#if idx < loadingProgressStep}
									<span
										class="h-3.5 w-3.5 font-bold text-white flex items-center justify-center rounded-full bg-primary text-[9px]"
										>✓</span
									>
								{:else if idx === loadingProgressStep}
									<span
										class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
									></span>
								{:else}
									<span class="h-3.5 w-3.5 rounded-full border border-border"></span>
								{/if}
								<span>{stepLabel}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Step 2 Actions -->
			<div class="pt-4 flex items-center justify-between border-t border-border/40">
				<button
					type="button"
					onclick={() => (step = 1)}
					class="text-xs font-bold cursor-pointer text-text-muted hover:text-text"
				>
					&larr; Back to Subject
				</button>
				<button
					type="button"
					onclick={generateDraftOutline}
					disabled={loading}
					class="gap-2 px-6 py-3 text-xs font-bold text-white inline-flex cursor-pointer items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20 hover:bg-primary-hover active:scale-98 disabled:opacity-50"
				>
					{#if loading}
						<span
							class="h-4 w-4 animate-spin border-white rounded-full border-2 border-t-transparent"
						></span>
						Generating Outline...
					{:else}
						<span>Generate Draft Outline &rarr;</span>
					{/if}
				</button>
			</div>
		</div>

		<!-- STEP 3: Draft Outline Review -->
	{:else if step === 3}
		<div class="gap-4 flex flex-col">
			<div
				class="rounded-2xl p-4 text-xs font-bold border border-primary/30 bg-primary-soft/30 text-primary"
			>
				✨ Draft outline ready! Review module titles, drag to reorder, add/remove modules, or edit
				details before finalizing your course.
			</div>

			<DraftOutlineEditor
				bind:title={draftTitle}
				bind:description={draftDescription}
				bind:modules={draftModules}
				courseId={draftCourseId}
				onSave={handleSaveDraft}
				onConfirm={handleConfirmAndGenerate}
				{loading}
			/>
		</div>
	{/if}
</div>
