<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import PageIndicator from '$lib/components/PageIndicator.svelte';
	import LessonAudioPlayer from '$lib/components/LessonAudioPlayer.svelte';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';
	import LessonBlockRenderer from '$lib/components/lesson-blocks/LessonBlockRenderer.svelte';
	import StudyLensToolbar from '$lib/components/StudyLensToolbar.svelte';
	import { interceptMermaidBlocks } from '$lib/components/MermaidInterceptor';
	import { studySessionStore, type CanonicalConcept } from '$lib/stores/studySession.svelte';
	import type { AIProvenanceMetadata } from '$lib/server/ai/provider';
	import type { LessonBlock } from '$lib/firebase/converters';

	interface LessonPage {
		order: number;
		heading: string;
		subheading?: string | null;
		body?: string;
		blocks?: LessonBlock[];
	}

	interface Props {
		courseId: string;
		moduleId: string;
		moduleTitle: string;
		pages: LessonPage[];
		canonicalConcepts?: CanonicalConcept[];
		currentPageIndex: number;
		onPageChange: (index: number) => void;
		onComplete: () => void;
		onRegeneratePage?: () => void;
		onFlagContent?: () => void;
		isRegenerating?: boolean;
		provenance?: AIProvenanceMetadata | null;
	}

	let {
		courseId,
		moduleId,
		moduleTitle,
		pages = [],
		canonicalConcepts = [],
		currentPageIndex = 0,
		onPageChange,
		onComplete,
		onRegeneratePage,
		onFlagContent,
		isRegenerating = false,
		provenance = null
	}: Props = $props();

	// Zen Focus Mode state
	let zenMode = $state(false);

	// Font size scaling state ('sm' | 'md' | 'lg')
	let fontSize = $state<'sm' | 'md' | 'lg'>('md');

	// Table of contents drawer toggle
	let showToc = $state(false);

	// Derived active page
	let activePage = $derived(pages[currentPageIndex] || null);

	function extractBlockText(b: LessonBlock): string {
		switch (b.type) {
			case 'text':
			case 'callout':
				return b.markdown || '';
			case 'term':
				return `${b.term} ${b.definition}`;
			case 'check':
				return `${b.prompt} ${b.explanation}`;
			case 'flashcard':
				return `${b.front} ${b.back}`;
			case 'diagram':
				return b.caption || '';
			default:
				return '';
		}
	}

	// Derived reading time estimate
	let totalWords = $derived.by(() => {
		if (!activePage) return 0;
		if (activePage.blocks && activePage.blocks.length > 0) {
			return activePage.blocks.reduce((acc, b) => {
				const text = extractBlockText(b);
				return acc + text.split(/\s+/).filter(Boolean).length;
			}, 0);
		}
		return (activePage.body || '').split(/\s+/).filter(Boolean).length;
	});

	let estReadingMins = $derived(Math.max(1, Math.ceil(totalWords / 180)));

	// Intercepted Mermaid Diagrams
	let mermaidResult = $derived.by(() => {
		if (!activePage || activePage.blocks || !activePage.body) return null;
		return interceptMermaidBlocks(activePage.body);
	});

	// Sync active heading to studySessionStore
	$effect(() => {
		if (activePage?.heading) {
			studySessionStore.setModule(moduleId, activePage.heading);
		}
	});

	const handlePrevPage = () => {
		if (currentPageIndex > 0) {
			onPageChange(currentPageIndex - 1);
		}
	};

	const handleNextPage = () => {
		if (currentPageIndex < pages.length - 1) {
			onPageChange(currentPageIndex + 1);
		} else {
			studySessionStore.dispatchServerEvent({
				eventType: 'lesson_completed',
				courseId,
				moduleId,
				metadata: {
					sourceLabel: moduleTitle
				}
			});
			onComplete();
		}
	};
</script>

<div
	class="lesson-container flex w-full flex-col gap-5 transition-all duration-200 {zenMode
		? 'fixed inset-0 z-50 overflow-y-auto bg-bg p-6 sm:p-12'
		: 'relative'}"
>
	<!-- Contextual Selection Toolbar for Study Lens AI -->
	<StudyLensToolbar
		{courseId}
		{moduleId}
		{canonicalConcepts}
		containerSelector=".lesson-content-area"
	/>

	<!-- Top Action & Navigation Bar -->
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3.5 {zenMode
			? 'mx-auto w-full max-w-4xl'
			: ''}"
	>
		<!-- Left: TOC & Page Indicator -->
		<div class="flex items-center gap-3">
			{#if pages.length > 1}
				<button
					type="button"
					onclick={() => (showToc = !showToc)}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-2xs hover:border-primary/50"
				>
					<span>📖 Contents</span>
					<span
						class="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-text-muted"
						>{pages.length} Pages</span
					>
				</button>
			{/if}

			<PageIndicator current={currentPageIndex + 1} total={pages.length} />
		</div>

		<!-- Right: Tools (Zen Mode, Font Size, Audio, Regenerate) -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- Font Sizing Buttons -->
			<div class="flex items-center rounded-xl border border-border bg-surface p-0.5 shadow-2xs">
				<button
					type="button"
					onclick={() => (fontSize = 'sm')}
					class="cursor-pointer rounded-lg px-2 py-1 text-xs font-bold transition-colors {fontSize ===
					'sm'
						? 'bg-primary text-white'
						: 'text-text-muted hover:text-text'}"
					title="Small font"
					aria-label="Small font"
				>
					A-
				</button>
				<button
					type="button"
					onclick={() => (fontSize = 'md')}
					class="cursor-pointer rounded-lg px-2 py-1 text-xs font-bold transition-colors {fontSize ===
					'md'
						? 'bg-primary text-white'
						: 'text-text-muted hover:text-text'}"
					title="Medium font"
					aria-label="Medium font"
				>
					A
				</button>
				<button
					type="button"
					onclick={() => (fontSize = 'lg')}
					class="cursor-pointer rounded-lg px-2 py-1 text-xs font-bold transition-colors {fontSize ===
					'lg'
						? 'bg-primary text-white'
						: 'text-text-muted hover:text-text'}"
					title="Large font"
					aria-label="Large font"
				>
					A+
				</button>
			</div>

			<!-- Zen Focus Mode Toggle -->
			<button
				type="button"
				onclick={() => (zenMode = !zenMode)}
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text shadow-2xs transition-colors hover:border-primary"
				title={zenMode ? 'Exit Zen Focus Mode' : 'Enter Distraction-Free Zen Focus Mode'}
			>
				<span>{zenMode ? '🪟 Exit Zen' : '🧘 Zen Mode'}</span>
			</button>

			<!-- Regenerate Single Page with AI -->
			{#if onRegeneratePage}
				<button
					type="button"
					onclick={onRegeneratePage}
					disabled={isRegenerating}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/40 bg-primary-soft/50 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white disabled:opacity-50"
					title="Regenerate this specific lesson page with AI"
				>
					{#if isRegenerating}
						<span
							class="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
						></span>
						<span>Regenerating...</span>
					{:else}
						<span>✨ Regenerate Page</span>
					{/if}
				</button>
			{/if}

			<!-- Flag / Report Content Issue -->
			{#if onFlagContent}
				<button
					type="button"
					onclick={onFlagContent}
					class="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted shadow-2xs transition-colors hover:border-rose-500/40 hover:text-rose-400"
					title="Report an issue or flag content"
					aria-label="Flag or report content issue"
				>
					<span>🚩 Flag</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- Degraded Tier Provenance Notice (if failover occurred) -->
	{#if provenance && provenance.degradedTier}
		<div
			class="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 shadow-2xs {zenMode
				? 'mx-auto w-full max-w-4xl'
				: ''}"
		>
			<div class="flex items-center gap-2">
				<span>⚡</span>
				<span>Generated with lightweight model tier ({provenance.provider}).</span>
			</div>
			{#if onRegeneratePage}
				<button
					type="button"
					onclick={onRegeneratePage}
					class="cursor-pointer text-xs font-bold text-amber-300 underline hover:text-amber-200"
				>
					Regenerate with Full AI
				</button>
			{/if}
		</div>
	{/if}

	<!-- Table of Contents Flyout Modal -->
	{#if showToc}
		<div
			class="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-lg {zenMode
				? 'mx-auto w-full max-w-4xl'
				: ''}"
		>
			<div class="flex items-center justify-between border-b border-border/60 pb-2">
				<h4 class="font-display text-xs font-bold text-text">Lesson Outline</h4>
				<button
					type="button"
					onclick={() => (showToc = false)}
					class="cursor-pointer text-xs text-text-muted hover:text-text"
				>
					✕
				</button>
			</div>
			<div class="flex flex-col gap-1.5">
				{#each pages as page, idx (page.order || idx)}
					<button
						type="button"
						onclick={() => {
							onPageChange(idx);
							showToc = false;
						}}
						class="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors {idx ===
						currentPageIndex
							? 'bg-primary font-bold text-white shadow-xs'
							: 'text-text hover:bg-surface-muted'}"
					>
						<span class="truncate">{idx + 1}. {page.heading || `Page ${idx + 1}`}</span>
						{#if page.subheading}
							<span class="ml-2 truncate text-[10px] opacity-75">{page.subheading}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Main Reading Card -->
	<div
		class="lesson-content-area flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-10 {zenMode
			? 'mx-auto w-full max-w-4xl'
			: ''}"
	>
		{#if activePage}
			<!-- Heading & Reading Metadata -->
			<div class="flex flex-col gap-2 border-b border-border/60 pb-4">
				<div class="flex items-center justify-between text-xs text-text-muted">
					<span class="font-bold text-primary uppercase"
						>Page {currentPageIndex + 1} of {pages.length}</span
					>
					<span>⏱️ ~{estReadingMins} min read</span>
				</div>
				<h2 class="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
					{activePage.heading}
				</h2>
				{#if activePage.subheading}
					<p class="text-sm font-semibold text-text-muted">{activePage.subheading}</p>
				{/if}
			</div>

			<!-- Lesson Audio Player -->
			{#if activePage.body || (activePage.blocks && activePage.blocks.length > 0)}
				{@const audioText =
					activePage.body ||
					activePage.blocks?.map(extractBlockText).filter(Boolean).join('. ') ||
					''}
				<LessonAudioPlayer text={audioText} title={activePage.heading} />
			{/if}

			<!-- Reading Body Content -->
			<div
				class="prose dark:prose-invert max-w-none text-text {fontSize === 'sm'
					? 'text-xs leading-relaxed'
					: fontSize === 'lg'
						? 'text-base leading-loose'
						: 'text-sm leading-relaxed'}"
			>
				{#if activePage.blocks && activePage.blocks.length > 0}
					<LessonBlockRenderer blocks={activePage.blocks} />
				{:else if mermaidResult && mermaidResult.sections.length > 0}
					{#each mermaidResult.sections as section, idx (idx)}
						{#if section.type === 'html'}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html section.content}
						{:else if section.type === 'mermaid'}
							<div
								class="my-6 rounded-2xl border border-border/80 bg-surface-muted/60 p-4 shadow-xs"
							>
								<MermaidDiagram code={section.code} />
							</div>
						{/if}
					{/each}
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html DOMPurify.sanitize(marked.parse(activePage.body || '') as string)}
				{/if}
			</div>
		{/if}
	</div>

	<!-- Bottom Navigation & Page Controls -->
	<div class="flex items-center justify-between pt-2 {zenMode ? 'mx-auto w-full max-w-4xl' : ''}">
		<button
			type="button"
			onclick={handlePrevPage}
			disabled={currentPageIndex === 0}
			class="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3 text-xs font-bold text-text shadow-2xs transition-all hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
		>
			<span>&larr; Previous Page</span>
		</button>

		<button
			type="button"
			onclick={handleNextPage}
			class="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
		>
			<span>{currentPageIndex < pages.length - 1 ? 'Next Page &rarr;' : 'Complete Lesson 🎉'}</span>
		</button>
	</div>
</div>
