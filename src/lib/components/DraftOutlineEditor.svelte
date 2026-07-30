<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface ModuleOutline {
		id?: string;
		order: number;
		type: 'lesson' | 'quiz';
		title: string;
		summary: string;
		estimatedMinutes?: number;
	}

	interface Props {
		title: string;
		description: string;
		modules: ModuleOutline[];
		courseId?: string;
		onSave: (data: {
			title: string;
			description: string;
			modules: ModuleOutline[];
		}) => Promise<void>;
		onConfirm: () => Promise<void>;
		loading?: boolean;
	}

	let {
		title = $bindable(),
		description = $bindable(),
		modules = $bindable(),
		courseId = '',
		onSave,
		onConfirm,
		loading = false
	}: Props = $props();

	let draggedIndex = $state<number | null>(null);
	let isSaving = $state(false);

	// Item #4: Steering direction input and single-module regeneration state
	let steeringHint = $state('');
	let isRegeneratingOutline = $state(false);
	let regeneratingModuleIndex = $state<number | null>(null);

	const moveModule = (fromIndex: number, toIndex: number) => {
		if (toIndex < 0 || toIndex >= modules.length) return;
		const updated = [...modules];
		const [moved] = updated.splice(fromIndex, 1);
		updated.splice(toIndex, 0, moved);
		// Re-assign order numbers
		modules = updated.map((m, idx) => ({ ...m, order: idx + 1 }));
	};

	const deleteModule = (index: number) => {
		if (modules.length <= 1) return;
		const updated = modules.filter((_, idx) => idx !== index);
		modules = updated.map((m, idx) => ({ ...m, order: idx + 1 }));
	};

	const addBlankModule = () => {
		const newMod: ModuleOutline = {
			order: modules.length + 1,
			type: modules.length % 2 === 0 ? 'lesson' : 'quiz',
			title: `Module ${modules.length + 1}: Custom Topic`,
			summary: 'Enter a brief one-line overview of what this module covers.',
			estimatedMinutes: 12
		};
		modules = [...modules, newMod];
	};

	// Item #4: Single Module Outline AI Regeneration
	const handleRegenerateSingleModule = async (index: number) => {
		if (!courseId || regeneratingModuleIndex !== null) return;
		regeneratingModuleIndex = index;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/draft/regenerate-module`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					moduleIndex: index,
					currentModules: modules
				})
			});

			const data = await res.json();
			if (res.ok && data.module) {
				const updated = [...modules];
				updated[index] = {
					...updated[index],
					title: data.module.title,
					summary: data.module.summary
				};
				modules = updated;
				toastStore.success(`Module ${index + 1} regenerated!`);
			} else {
				throw new Error(data.error?.message || 'Failed to regenerate module');
			}
		} catch (err) {
			console.error('Single module regeneration error:', err);
			toastStore.error('Could not regenerate this module.');
		} finally {
			regeneratingModuleIndex = null;
		}
	};

	// Item #4: Steering Direction Whole Outline AI Regeneration
	const handleRegenerateOutlineWithSteering = async () => {
		if (!courseId || isRegeneratingOutline) return;
		isRegeneratingOutline = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch(`/api/courses/${courseId}/draft/regenerate-outline`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ steeringHint })
			});

			const data = await res.json();
			if (res.ok && data.outline) {
				title = data.outline.title || title;
				description = data.outline.description || description;
				modules = (data.outline.modules || []).map(
					(m: { type: 'lesson' | 'quiz'; title: string; summary: string }, idx: number) => ({
						order: idx + 1,
						type: m.type,
						title: m.title,
						summary: m.summary,
						estimatedMinutes: 12
					})
				);
				toastStore.success('Whole outline regenerated with steering hint!');
			} else {
				throw new Error(data.error?.message || 'Failed to regenerate outline');
			}
		} catch (err) {
			console.error('Steering outline regeneration error:', err);
			toastStore.error('Could not regenerate outline.');
		} finally {
			isRegeneratingOutline = false;
		}
	};

	const handleDragStart = (idx: number) => {
		draggedIndex = idx;
	};

	const handleDragOver = (e: DragEvent, idx: number) => {
		e.preventDefault();
		if (draggedIndex === null || draggedIndex === idx) return;
		moveModule(draggedIndex, idx);
		draggedIndex = idx;
	};

	const handleDragEnd = () => {
		draggedIndex = null;
	};

	const handleSaveAndConfirm = async () => {
		if (loading || isSaving) return;
		isSaving = true;
		try {
			await onSave({ title, description, modules });
			await onConfirm();
		} finally {
			isSaving = false;
		}
	};
</script>

<div class="flex w-full flex-col gap-6">
	<!-- Editable Course Title and Description -->
	<div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
		<h3 class="font-display text-lg font-bold text-text">Review Course Details</h3>

		<div class="flex flex-col gap-1.5">
			<label for="course-title" class="text-xs font-bold tracking-wider text-text-muted uppercase"
				>Course Title</label
			>
			<input
				id="course-title"
				type="text"
				bind:value={title}
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text focus:border-primary focus:outline-none"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="course-desc" class="text-xs font-bold tracking-wider text-text-muted uppercase"
				>Course Summary / Goal</label
			>
			<textarea
				id="course-desc"
				bind:value={description}
				rows="3"
				class="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-xs leading-relaxed text-text focus:border-primary focus:outline-none"
			></textarea>
		</div>

		<!-- Item #4: Steering Hint & Whole Outline Regeneration Banner -->
		{#if courseId}
			<div
				class="mt-2 flex flex-col gap-2.5 rounded-xl border border-primary/20 bg-primary-soft/30 p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold text-primary">✨ Steering Direction (Optional)</span>
					<span class="text-[10px] text-text-muted"
						>Direct the AI to adjust tone, depth, or focus</span
					>
				</div>
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={steeringHint}
						placeholder="e.g., Make it more beginner-friendly, focus heavily on hands-on practical examples..."
						class="grow rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
					/>
					<button
						type="button"
						onclick={handleRegenerateOutlineWithSteering}
						disabled={isRegeneratingOutline}
						class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover active:scale-95 disabled:opacity-40"
					>
						{#if isRegeneratingOutline}
							<span
								class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							<span>Regenerating...</span>
						{:else}
							<span>🔄 Steering Regenerate</span>
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Module List with Drag & Reorder -->
	<div class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<h3 class="font-display text-base font-bold text-text">Modules ({modules.length})</h3>
			<span class="text-[11px] font-semibold text-text-muted"
				>Drag to reorder, edit titles, or regenerate single modules</span
			>
		</div>

		<div class="flex flex-col gap-3">
			{#each modules as mod, idx (mod.id || idx)}
				<div
					role="listitem"
					draggable="true"
					ondragstart={() => handleDragStart(idx)}
					ondragover={(e) => handleDragOver(e, idx)}
					ondragend={handleDragEnd}
					class="group relative flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs transition-all duration-180 hover:border-primary/40 {draggedIndex ===
					idx
						? 'border-primary opacity-50'
						: ''}"
				>
					<!-- Drag Handle -->
					<div
						class="mt-2.5 flex cursor-grab items-center text-text-muted hover:text-text active:cursor-grabbing"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 8h16M4 16h16"
							/>
						</svg>
					</div>

					<!-- Order Badge -->
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-bold text-primary"
					>
						{idx + 1}
					</div>

					<!-- Module Content Inputs -->
					<div class="flex grow flex-col gap-2">
						<div class="flex items-center gap-2">
							<input
								type="text"
								bind:value={mod.title}
								class="grow rounded-lg border border-border/60 bg-surface-muted/50 px-3 py-1.5 text-xs font-bold text-text focus:border-primary focus:outline-none"
							/>

							<!-- Module Type Icon + Badge (Item #4) -->
							<span
								class="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-0.5 text-[10px] font-bold text-text-muted uppercase"
							>
								<span>{mod.type === 'lesson' ? '📖 Lesson' : '🧩 Quiz'}</span>
							</span>

							<!-- Module Estimated Duration Tag (Item #4) -->
							<span
								class="rounded-md border border-border/40 bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-text-muted"
							>
								⏱️ ~{mod.estimatedMinutes || 12} mins
							</span>
						</div>
						<textarea
							bind:value={mod.summary}
							rows="2"
							class="w-full resize-none rounded-lg border border-border/40 bg-surface-muted/30 px-3 py-1.5 text-[11px] leading-relaxed text-text-muted focus:border-primary focus:outline-none"
						></textarea>
					</div>

					<!-- Action Buttons (Single Regenerate, Move up, Move down, Delete) -->
					<div class="flex shrink-0 items-center gap-1">
						{#if courseId}
							<button
								type="button"
								title="Regenerate this specific module with AI"
								disabled={regeneratingModuleIndex !== null}
								onclick={() => handleRegenerateSingleModule(idx)}
								class="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-soft/80 disabled:opacity-30"
							>
								{#if regeneratingModuleIndex === idx}
									<span
										class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
									></span>
								{:else}
									✨ Regenerate
								{/if}
							</button>
						{/if}
						<button
							type="button"
							title="Move up"
							disabled={idx === 0}
							onclick={() => moveModule(idx, idx - 1)}
							class="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-30"
						>
							&uarr;
						</button>
						<button
							type="button"
							title="Move down"
							disabled={idx === modules.length - 1}
							onclick={() => moveModule(idx, idx + 1)}
							class="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-30"
						>
							&darr;
						</button>
						<button
							type="button"
							title="Delete module"
							disabled={modules.length <= 1}
							onclick={() => deleteModule(idx)}
							class="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
						>
							&times;
						</button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Add Module Slot -->
		<button
			type="button"
			onclick={addBlankModule}
			class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-3 text-xs font-bold text-text-muted transition-all duration-180 hover:border-primary hover:bg-primary-soft/20 hover:text-primary active:scale-[0.99]"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2.5"
					d="M12 4v16m8-8H4"
				/>
			</svg>
			+ Add a module slot
		</button>
	</div>

	<!-- Confirm and Generate Full Course CTA -->
	<div class="flex items-center justify-end gap-3 pt-4">
		<button
			type="button"
			onclick={handleSaveAndConfirm}
			disabled={loading || isSaving}
			class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all duration-180 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 sm:w-auto"
		>
			{#if loading || isSaving}
				<span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
				></span>
				Building course modules...
			{:else}
				<span>Confirm & Generate Full Course</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M14 5l7 7m0 0l-7 7m7-7H3"
					/>
				</svg>
			{/if}
		</button>
	</div>
</div>
