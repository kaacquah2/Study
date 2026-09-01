<script lang="ts">
	import AppShell from '$lib/components/AppShell.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { page } from '$app/state';
	import { db, auth } from '$lib/firebase/client';
	import { doc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { themeStore } from '$lib/stores/theme.svelte';

	interface LessonPage {
		heading: string;
		subheading: string | null;
		body: string;
	}

	interface QuizQuestion {
		prompt: string;
		options: string[];
		correctIndex: number;
		explanation: string;
	}

	interface Course {
		title: string;
		description: string;
		format: string;
		ownerUid: string;
		moduleCount: number;
		accent: 'violet' | 'amber' | 'emerald';
		status: 'ready' | 'building' | 'partial' | 'failed';
		progress?: { completed: number; total: number };
	}

	interface Module {
		id: string;
		order: number;
		type: 'lesson' | 'quiz';
		title: string;
		summary: string;
		learningObjective?: string;
		status: 'pending' | 'generating' | 'ready' | 'failed';
		error?: string | null;
		pages?: LessonPage[];
		questions?: QuizQuestion[];
	}

	const courseId = $derived(page.params.id);

	// Firestore snapshot states
	let course = $state<Course | null>(null);
	let modules = $state<Module[]>([]);
	let completedModuleIds = $state<string[]>([]);
	let loadingCourse = $state(true);
	let loadingModules = $state(true);

	// Tracking modules we have dispatched generation calls for to prevent duplicates
	let dispatchedModules = new SvelteSet<string>();

	// Share Dialog states
	let showShareModal = $state(false);
	let shareUrl = $state('');
	let actionLoading = $state(false);

	// Derive completed / total stats
	let total = $derived(course?.moduleCount || modules.length || 1);
	let completed = $derived(completedModuleIds.length);
	let percent = $derived(Math.round((completed / total) * 100));

	// Initialize Firestore listeners
	$effect(() => {
		if (authStore.user && courseId) {
			// 1. Subscribe to Course document
			const courseRef = doc(db, 'courses', courseId);
			const unsubCourse = onSnapshot(courseRef, (snap) => {
				if (snap.exists()) {
					course = snap.data() as Course;
				}
				loadingCourse = false;
			});

			// 2. Subscribe to Course Modules
			const modulesQuery = query(
				collection(db, `courses/${courseId}/modules`),
				orderBy('order', 'asc')
			);
			const unsubModules = onSnapshot(modulesQuery, (snap) => {
				modules = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Module);
				loadingModules = false;

				// Auto-orchestrate parallel generation for pending modules
				triggerBackgroundGenerations();
			});

			// 3. Subscribe to User Progress
			const progressRef = doc(db, 'users', authStore.user.uid, 'progress', courseId);
			const unsubProgress = onSnapshot(progressRef, (snap) => {
				if (snap.exists()) {
					completedModuleIds = snap.data().completedModuleIds || [];
				} else {
					completedModuleIds = [];
				}
			});

			return () => {
				unsubCourse();
				unsubModules();
				unsubProgress();
			};
		}
	});

	// Client-side parallel generator orchestration (Fallback B)
	const triggerBackgroundGenerations = async () => {
		if (!auth.currentUser || !courseId) return;

		for (const mod of modules) {
			if (mod.status === 'pending' && !dispatchedModules.has(mod.id)) {
				dispatchedModules.add(mod.id);

				// Dispatch API fetch call in the background
				dispatchGeneration(mod.id);
			}
		}
	};

	const dispatchGeneration = async (moduleId: string) => {
		try {
			const idToken = await auth.currentUser?.getIdToken();
			await fetch(`/api/modules/${moduleId}/generate`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					'X-Client-Theme': themeStore.current,
					'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
				},
				body: JSON.stringify({ courseId })
			});
			// The Firestore snapshot listener will automatically update the row when status changes to ready/failed
		} catch (e) {
			console.error(`Failed to trigger generation for module ${moduleId}:`, e);
			dispatchedModules.delete(moduleId); // allow retry on network errors
		}
	};

	// Retry generating a failed module
	const handleRetryModule = async (moduleId: string) => {
		actionLoading = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/modules/${moduleId}/retry`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					'X-Client-Theme': themeStore.current,
					'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
				},
				body: JSON.stringify({ courseId })
			});

			if (!res.ok) {
				throw new Error('Failed to reset module status');
			}

			// Evict from dispatched list so Svelte effect can trigger the background dispatch again
			dispatchedModules.delete(moduleId);
		} catch (e) {
			console.error(e);
			alert('Could not retry generation. Please try again.');
		} finally {
			actionLoading = false;
		}
	};

	// Generate share link
	const triggerShareLink = async () => {
		if (!courseId || actionLoading) return;
		actionLoading = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/share`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				}
			});

			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.error?.message || 'Failed to generate link');
			}

			shareUrl = result.url;
			showShareModal = true;
		} catch (e) {
			console.error(e);
			const message = e instanceof Error ? e.message : 'Failed to generate link.';
			alert(message);
		} finally {
			actionLoading = false;
		}
	};

	// Copy success logic handled inside ShareModal component

	// Revoke shared link
	const handleRevokeShare = async () => {
		if (
			!confirm('Are you sure you want to revoke this link? Anyone with the link will lose access.')
		) {
			return;
		}
		actionLoading = true;

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/share`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${idToken}`
				}
			});

			if (!res.ok) {
				throw new Error('Failed to revoke share link');
			}

			showShareModal = false;
			alert('Shared link revoked successfully.');
		} catch (e) {
			console.error(e);
			alert('Could not revoke link.');
		} finally {
			actionLoading = false;
		}
	};

	const exportCourseToMarkdown = () => {
		if (!course || modules.length === 0) return;

		let md = `# ${course.title}\n\n`;
		md += `> ${course.description}\n\n`;
		md += `*Generated by AI Study Buddy for KNUST*\n\n`;
		md += `## Table of Contents\n\n`;

		// Outline
		modules.forEach((mod, index) => {
			md += `${index + 1}. [Module ${index + 1}: ${mod.title} (${mod.type === 'lesson' ? 'Lesson' : 'Quiz'})](#module-${index + 1}-${mod.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})\n`;
		});
		md += `\n---\n\n`;

		// Modules
		modules.forEach((mod, index) => {
			md += `## Module ${index + 1}: ${mod.title}\n\n`;
			md += `**Summary**: ${mod.summary}\n\n`;
			md += `**Learning Objective**: ${mod.learningObjective || 'N/A'}\n\n`;

			if (mod.type === 'lesson' && mod.pages && mod.pages.length > 0) {
				md += `### Lesson Content\n\n`;
				mod.pages.forEach((page) => {
					md += `#### ${page.heading}\n\n`;
					if (page.subheading) {
						md += `*${page.subheading}*\n\n`;
					}
					md += `${page.body}\n\n`;
				});
			} else if (mod.type === 'quiz' && mod.questions && mod.questions.length > 0) {
				md += `### Quiz Questions\n\n`;
				mod.questions.forEach((q, qIdx) => {
					md += `#### Question ${qIdx + 1}: ${q.prompt}\n\n`;
					q.options.forEach((opt: string, optIdx: number) => {
						const isCorrect = optIdx === q.correctIndex;
						md += `- [ ${isCorrect ? 'x' : ' '} ] ${opt}\n`;
					});
					md += `\n* **Explanation**: ${q.explanation}\n\n`;
				});
			}
			md += `\n---\n\n`;
		});

		// Trigger client-side download
		const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.setAttribute(
			'download',
			`${course.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_course.md`
		);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};
</script>

<svelte:head>
	<title>{course ? course.title : 'Course'} &mdash; AI Study Buddy</title>
</svelte:head>

<AppShell requireAuth={true}>
	<div class="max-w-4xl gap-6 px-6 py-10 mx-auto flex w-full grow flex-col">
		<!-- Back Link and Share Button row -->
		<div class="flex items-center justify-between select-none">
			<a
				href={resolve('/app')}
				class="gap-1.5 text-xs font-bold tracking-wider inline-flex items-center text-text-muted uppercase transition-colors duration-180 hover:text-primary"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-3.5 w-3.5"
					><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg
				>
				All courses
			</a>

			{#if course && course.status === 'ready'}
				<div class="gap-2 flex items-center">
					<button
						type="button"
						class="gap-2 px-4 py-2.5 text-xs font-bold inline-flex cursor-pointer items-center rounded-r-md border border-border bg-surface text-text shadow-sm transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
						onclick={exportCourseToMarkdown}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-3.5 w-3.5"
							><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
								points="7 10 12 15 17 10"
							/><line x1="12" y1="15" x2="12" y2="3" /></svg
						>
						Export
					</button>

					<button
						type="button"
						class="gap-2 px-4 py-2.5 text-xs font-bold inline-flex cursor-pointer items-center rounded-r-md border border-border bg-surface text-text shadow-sm transition-all duration-180 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
						onclick={triggerShareLink}
						disabled={actionLoading}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-3.5 w-3.5"
							><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline
								points="16 6 12 2 8 6"
							/><line x1="12" y1="2" x2="12" y2="15" /></svg
						>
						Share
					</button>
				</div>
			{/if}
		</div>

		{#if loadingCourse}
			<!-- Shimmer loading state for header -->
			<div class="animate-pulse p-6 rounded-lg border border-border bg-surface shadow-sm">
				<div class="mb-3 h-4 w-20 rounded bg-surface-muted"></div>
				<div class="mb-3 h-8 rounded w-2/3 bg-surface-muted"></div>
				<div class="h-4 rounded w-full bg-surface-muted"></div>
			</div>
		{:else if !course}
			<!-- 404 state -->
			<div class="my-10 p-10 rounded-lg border border-border bg-surface text-center shadow-md">
				<h3 class="mb-2 font-display text-xl font-bold text-text">Course not found</h3>
				<p class="mb-6 text-sm text-text-muted">
					The course you are looking for does not exist or has been deleted.
				</p>
				<a
					href={resolve('/app')}
					class="px-6 py-3 text-xs font-bold text-white rounded-r-md bg-primary shadow-sm hover:bg-primary-hover"
				>
					Return to dashboard
				</a>
			</div>
		{:else}
			<!-- Course Main Card Header -->
			<div class="p-6 sm:p-8 rounded-lg border border-border bg-surface shadow-md">
				<div class="mb-3 gap-3 flex items-center">
					{#if course.status === 'building'}
						<span
							class="animate-pulse gap-1.5 rounded px-2.5 py-0.5 font-bold tracking-wider inline-flex items-center bg-primary-soft text-[10px] text-primary uppercase"
						>
							<span class="h-1.5 w-1.5 animate-ping rounded-full bg-primary"></span>
							Building Course
						</span>
					{:else if course.status === 'ready'}
						<span
							class="gap-1 px-2 py-0.5 font-bold tracking-wider inline-flex items-center rounded-sm bg-success-soft text-[10px] text-success uppercase"
						>
							Ready
						</span>
					{:else}
						<span
							class="gap-1 px-2 py-0.5 font-bold tracking-wider inline-flex items-center rounded-sm bg-course-amber-soft text-[10px] text-course-amber uppercase"
						>
							Building modules
						</span>
					{/if}
				</div>

				<h2
					class="mb-2 font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl text-text"
				>
					{course.title}
				</h2>
				<p class="mb-6 text-xs leading-relaxed sm:text-sm text-text-muted">
					{course.description}
				</p>

				<!-- Overall Progress bar -->
				<div
					class="mb-2 font-bold tracking-wider flex items-center justify-between text-[10px] text-text-muted uppercase"
				>
					<span>Progress</span>
					<span>{completed} / {total} complete</span>
				</div>
				<div
					class="h-2 w-full overflow-hidden rounded-full border border-border/10 bg-surface-muted"
				>
					<div
						class="h-full rounded-full transition-all duration-300 {course.accent === 'violet'
							? 'bg-course-violet'
							: course.accent === 'amber'
								? 'bg-course-amber'
								: 'bg-course-emerald'}"
						style="width: {percent}%"
					></div>
				</div>
			</div>

			<!-- Modules Rows Container -->
			<div class="mt-4 gap-4 flex flex-col" aria-live="polite">
				<h3 class="mb-1 pl-1 text-xs font-bold tracking-wider text-text-muted uppercase">
					Syllabus Modules
				</h3>

				{#if loadingModules && modules.length === 0}
					<!-- Module Loading shimmers -->
					{#each [0, 1, 2, 3] as idx (idx)}
						<div
							class="h-20 animate-pulse rounded-lg border border-border bg-surface shadow-sm"
						></div>
					{/each}
				{:else}
					{#each modules as mod (mod.id)}
						{#if mod.status === 'pending' || mod.status === 'generating'}
							<!-- Shimmer skeleton row for active generation -->
							<div
								class="p-5 relative flex items-center justify-between overflow-hidden rounded-lg border border-border bg-surface shadow-sm select-none"
							>
								<!-- Shimmer highlight bar -->
								<div
									class="inset-0 absolute -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-surface-muted/20 to-transparent"
									style="background-size: 200% 100%;"
								></div>

								<div class="gap-4 flex w-full items-center">
									<div
										class="h-10 w-10 animate-pulse flex items-center justify-center rounded-lg bg-surface-muted"
									>
										<span class="h-4 w-4 animate-ping rounded-full bg-border"></span>
									</div>
									<div class="gap-2 flex grow flex-col">
										<div class="h-3 w-16 rounded bg-surface-muted"></div>
										<div class="h-4 rounded w-2/3 bg-surface-muted"></div>
										<div class="h-3.5 rounded w-1/2 bg-surface-muted"></div>
									</div>
								</div>
								<div class="h-9 w-16 animate-pulse rounded-r-md bg-surface-muted"></div>
							</div>
						{:else if mod.status === 'ready'}
							{@const isCompleted = completedModuleIds.includes(mod.id)}
							<!-- Ready Module Row -->
							<div
								class="p-5 flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm transition-colors duration-180 select-none hover:border-text-muted"
							>
								<div class="gap-4 flex items-center">
									<!-- Type tile -->
									<div
										class="h-10 w-10 text-sm font-bold flex items-center justify-center rounded-lg shadow-sm select-none {mod.type ===
										'lesson'
											? 'bg-primary-soft text-primary'
											: 'bg-course-amber-soft text-course-amber'}"
									>
										{mod.type === 'lesson' ? 'L' : 'Q'}
									</div>

									<div>
										<!-- Type Indicator Tag -->
										<span
											class="mb-1 font-bold tracking-widest block text-[9px] text-text-muted uppercase"
										>
											{mod.type === 'lesson' ? 'Lesson' : 'Quiz'}
										</span>
										<!-- Module title -->
										<h4
											class="mb-1 font-display text-sm leading-tight font-bold sm:text-base text-text"
										>
											{mod.title}
										</h4>
										<!-- Module summary -->
										<p class="text-xs leading-snug line-clamp-1 text-text-muted">
											{mod.summary}
										</p>
									</div>
								</div>

								<!-- Complete / Action Area -->
								<div class="ml-4 gap-3 flex items-center">
									{#if isCompleted}
										<div
											class="h-6 w-6 flex items-center justify-center rounded-full border border-success/15 bg-success-soft text-success shadow-sm"
											title="Module complete"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												stroke-linecap="round"
												stroke-linejoin="round"
												class="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12" /></svg
											>
										</div>
									{/if}

									<a
										href={resolve(
											`/courses/${courseId}/${mod.type === 'lesson' ? 'lessons' : 'quizzes'}/${mod.id}`
										)}
										class="px-4.5 py-2 text-xs font-bold hover:text-white rounded-r-md bg-primary-soft text-primary transition-all duration-180 hover:bg-primary active:scale-[0.97]"
									>
										{isCompleted ? 'Review' : 'Open'}
									</a>
								</div>
							</div>
						{:else if mod.status === 'failed'}
							<!-- Failed Module Row -->
							<div
								class="p-5 flex items-center justify-between rounded-lg border border-danger/25 bg-danger-soft/10 shadow-sm select-none"
							>
								<div class="gap-4 flex items-center">
									<div
										class="h-10 w-10 text-sm font-bold flex items-center justify-center rounded-lg border border-danger/10 bg-danger-soft text-danger shadow-sm"
									>
										!
									</div>

									<div>
										<span
											class="mb-1 font-bold tracking-widest block text-[9px] text-danger uppercase"
										>
											Generation Failed
										</span>
										<h4 class="mb-1 font-display text-sm leading-tight font-bold text-text">
											{mod.title}
										</h4>
										<p class="text-xs leading-snug text-danger/80">
											Error: {mod.error || 'Connection timed out. Please retry.'}
										</p>
									</div>
								</div>

								<!-- Retry Affordance -->
								<button
									type="button"
									class="gap-1.5 px-4.5 py-2 text-xs font-bold text-white flex cursor-pointer items-center rounded-r-md bg-danger transition-all hover:bg-danger/90 active:scale-[0.97]"
									onclick={() => handleRetryModule(mod.id)}
									disabled={actionLoading}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-3.5 w-3.5"
										><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg
									>
									Retry
								</button>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		{/if}
	</div>

	<!-- Share Modal Component -->
	<ShareModal
		show={showShareModal}
		{shareUrl}
		{actionLoading}
		onClose={() => {
			showShareModal = false;
		}}
		onRevoke={handleRevokeShare}
	/>
</AppShell>
