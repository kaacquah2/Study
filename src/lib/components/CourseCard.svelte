<script lang="ts">
	export interface Course {
		id: string;
		title: string;
		description: string;
		status: 'draft' | 'building' | 'ready' | 'partial' | 'failed';
		accent?: 'violet' | 'amber' | 'emerald';
		moduleCount: number;
		progress?: { completed: number; total: number };
	}

	interface Props {
		course?: Course;
		id?: string;
		title?: string;
		description?: string;
		status?: 'draft' | 'building' | 'ready' | 'partial' | 'failed';
		accent?: 'violet' | 'amber' | 'emerald';
		moduleCount?: number;
		progress?: { completed: number; total: number };
		onDelete?: (id: string) => void;
		onShare: (id: string) => void;
	}

	let props: Props = $props();

	let courseObj = $derived.by(() => {
		if (props.course) return props.course;
		return {
			id: props.id || '',
			title: props.title || '',
			description: props.description || '',
			status: props.status || 'draft',
			accent: props.accent || 'violet',
			moduleCount: props.moduleCount || 0,
			progress: props.progress
		} as Course;
	});

	let course = $derived(courseObj);
	let onDelete = $derived(props.onDelete || (() => {}));
	let onShare = $derived(props.onShare);

	// Compute completion percent
	let completed = $derived(course.progress?.completed || 0);
	let total = $derived(course.progress?.total || course.moduleCount || 1);
	let percent = $derived(Math.round((completed / total) * 100));

	// Visual classes mapped based on accents
	const borderClasses = {
		violet: 'border-t-4 border-t-course-violet',
		amber: 'border-t-4 border-t-course-amber',
		emerald: 'border-t-4 border-t-course-emerald'
	};

	const textAccentClasses = {
		violet: 'text-course-violet',
		amber: 'text-course-amber',
		emerald: 'text-course-emerald'
	};

	// Toggle context dropdown menu
	let showMenu = $state(false);

	const toggleMenu = (e: MouseEvent) => {
		e.stopPropagation();
		showMenu = !showMenu;
	};

	const handleDocumentClick = () => {
		showMenu = false;
	};

	// Delete confirmation modal state
	let showDeleteConfirmModal = $state(false);

	const triggerDelete = () => {
		showMenu = false;
		showDeleteConfirmModal = true;
	};

	const confirmDelete = () => {
		showDeleteConfirmModal = false;
		onDelete(course.id);
	};
	// Tilt effect on hover
	let tiltX = $state(0);
	let tiltY = $state(0);
	let isHovered = $state(false);

	const handleMouseMove = (e: MouseEvent) => {
		const card = e.currentTarget as HTMLElement;
		const rect = card.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		tiltX = ((e.clientY - cy) / (rect.height / 2)) * -5;
		tiltY = ((e.clientX - cx) / (rect.width / 2)) * 5;
		isHovered = true;
	};

	const handleMouseLeave = () => {
		tiltX = 0;
		tiltY = 0;
		isHovered = false;
	};
</script>

<svelte:window onclick={handleDocumentClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex flex-col justify-between rounded-lg border border-border bg-surface p-6 shadow-md transition-all duration-200 select-none {borderClasses[
		course.accent || 'violet'
	] || 'border-t-4 border-t-primary'} {isHovered ? 'shadow-xl' : ''}"
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	style="transform: perspective(800px) rotateX({tiltX}deg) rotateY({tiltY}deg) scale({isHovered
		? 1.015
		: 1}); will-change: transform;"
>
	<!-- Card Header -->
	<div class="mb-3 flex items-start justify-between gap-4">
		<!-- Status Badge -->
		<div>
			{#if course.status === 'building'}
				<span
					class="inline-flex items-center gap-1.5 rounded-sm bg-primary-soft px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase"
				>
					<span class="relative flex h-1.5 w-1.5">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary"></span>
					</span>
					Building...
				</span>
			{:else if course.status === 'ready'}
				<span
					class="inline-flex items-center gap-1 rounded-sm bg-success-soft px-2 py-0.5 text-[10px] font-bold tracking-wider text-success uppercase"
				>
					Ready
				</span>
			{:else if course.status === 'failed'}
				<span
					class="inline-flex items-center gap-1 rounded-sm bg-danger-soft px-2 py-0.5 text-[10px] font-bold tracking-wider text-danger uppercase"
				>
					Failed
				</span>
			{:else}
				<span
					class="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-0.5 text-[10px] font-bold tracking-wider text-text-muted uppercase"
				>
					Draft
				</span>
			{/if}
		</div>

		<!-- Options Menu Button -->
		<div class="relative">
			<button
				type="button"
				onclick={toggleMenu}
				aria-label="Course options menu"
				class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
				>
					<circle cx="12" cy="12" r="1" />
					<circle cx="12" cy="5" r="1" />
					<circle cx="12" cy="19" r="1" />
				</svg>
			</button>

			<!-- Dropdown Menu -->
			{#if showMenu}
				<div
					class="absolute top-full right-0 z-20 mt-1 w-36 rounded-md border border-border bg-surface p-1 shadow-lg"
				>
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							showMenu = false;
							onShare(course.id);
						}}
						class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-muted"
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
							><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle
								cx="18"
								cy="19"
								r="3"
							/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line
								x1="15.41"
								y1="6.51"
								x2="8.59"
								y2="10.49"
							/></svg
						>
						Share
					</button>

					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							triggerDelete();
						}}
						class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-soft"
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
							><polyline points="3 6 5 6 21 6" /><path
								d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
							/><line x1="10" y1="11" x2="10" y2="17" /><line
								x1="14"
								y1="11"
								x2="14"
								y2="17"
							/></svg
						>
						Delete
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Course Title & Description -->
	<div class="mb-6 grow">
		<h3
			class="mb-1.5 font-display text-lg leading-snug font-bold text-text transition-colors group-hover:text-primary"
		>
			{course.title}
		</h3>
		<p class="line-clamp-3 text-xs leading-relaxed text-text-muted">
			{course.description}
		</p>
	</div>

	<!-- Progress and Action block -->
	<div class="mt-auto">
		<!-- Progress Indicator -->
		<div
			class="mb-2 flex items-center justify-between text-[10px] font-bold tracking-wider text-text-muted uppercase"
		>
			<span>{course.moduleCount} modules</span>
			<span class={textAccentClasses[course.accent || 'violet'] || 'text-primary'}
				>{percent}% done</span
			>
		</div>

		<!-- Progress Bar -->
		<div
			class="mb-4 h-1.5 w-full overflow-hidden rounded-full border border-border/10 bg-surface-muted"
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

		<!-- Start Learning Button -->
		<a
			href={`/app/courses/${course.id}`}
			class="flex w-full items-center justify-center rounded-md bg-primary-soft px-4 py-3 text-xs font-bold text-primary shadow-sm transition-all duration-180 hover:bg-primary hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
		>
			{#if percent === 0}
				Start learning
			{:else if percent === 100}
				Review course
			{:else}
				Resume learning
			{/if}
		</a>
	</div>
</div>

<!-- Delete Confirmation Modal Dialog -->
{#if showDeleteConfirmModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
		<div
			class="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-2xl"
		>
			<div class="flex items-center gap-3 text-danger">
				<span class="text-2xl">⚠️</span>
				<h3 class="font-display text-base font-bold">Delete Course?</h3>
			</div>

			<p class="text-xs leading-relaxed text-text-muted">
				Are you sure you want to delete <strong class="text-text">"{course.title}"</strong>? This
				will permanently remove all modules, quiz progress, and certificate records.
			</p>

			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (showDeleteConfirmModal = false)}
					class="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-text-muted hover:text-text"
				>
					Cancel
				</button>

				<button
					type="button"
					onclick={confirmDelete}
					class="cursor-pointer rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-danger/90 active:scale-95"
				>
					Delete Course
				</button>
			</div>
		</div>
	</div>
{/if}
