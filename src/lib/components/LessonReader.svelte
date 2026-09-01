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
	class="lesson-container gap-5 flex w-full flex-col transition-all duration-200 {zenMode
		? 'inset-0 p-6 sm:p-12 fixed z-50 overflow-y-auto bg-bg'
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
		class="gap-3 pb-3.5 flex flex-wrap items-center justify-between border-b border-border/80 {zenMode
			? 'max-w-4xl mx-auto w-full'
			: ''}"
	>
		<!-- Left: TOC & Page Indicator -->
		<div class="gap-3 flex items-center">
			{#if pages.length > 1}
				<button
					type="button"
					onclick={() => (showToc = !showToc)}
					class="gap-1.5 px-3 py-1.5 text-xs font-semibold shadow-2xs inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text hover:border-primary/50"
				>
					<span>📖 Contents</span>
					<span
						class="px-1.5 py-0.5 font-bold rounded-md bg-surface-muted text-[10px] text-text-muted"
						>{pages.length} Pages</span
					>
				</button>
			{/if}

			<PageIndicator current={currentPageIndex + 1} total={pages.length} />
		</div>

		<!-- Right: Tools (Zen Mode, Font Size, Audio, Regenerate) -->
		<div class="gap-2 flex flex-wrap items-center">
			<!-- Font Sizing Buttons -->
			<div class="p-0.5 shadow-2xs flex items-center rounded-xl border border-border bg-surface">
				<button
					type="button"
					onclick={() => (fontSize = 'sm')}
					class="px-2 py-1 text-xs font-bold cursor-pointer rounded-lg transition-colors {fontSize ===
					'sm'
						? 'text-white bg-primary'
						: 'text-text-muted hover:text-text'}"
					title="Small font"
					aria-label="Small font"
				>
					A-
				</button>
				<button
					type="button"
					onclick={() => (fontSize = 'md')}
					class="px-2 py-1 text-xs font-bold cursor-pointer rounded-lg transition-colors {fontSize ===
					'md'
						? 'text-white bg-primary'
						: 'text-text-muted hover:text-text'}"
					title="Medium font"
					aria-label="Medium font"
				>
					A
				</button>
				<button
					type="button"
					onclick={() => (fontSize = 'lg')}
					class="px-2 py-1 text-xs font-bold cursor-pointer rounded-lg transition-colors {fontSize ===
					'lg'
						? 'text-white bg-primary'
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
				class="gap-1.5 px-3 py-1.5 text-xs font-bold shadow-2xs inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary"
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
					class="gap-1.5 px-3 py-1.5 text-xs font-bold hover:text-white inline-flex cursor-pointer items-center rounded-xl border border-primary/40 bg-primary-soft/50 text-primary transition-all hover:bg-primary disabled:opacity-50"
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
					class="gap-1 px-2.5 py-1.5 text-xs font-semibold shadow-2xs hover:border-rose-500/40 hover:text-rose-400 inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface text-text-muted transition-colors"
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
			class="border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 shadow-2xs flex items-center justify-between rounded-xl border {zenMode
				? 'max-w-4xl mx-auto w-full'
				: ''}"
		>
			<div class="gap-2 flex items-center">
				<span>⚡</span>
				<span>Generated with lightweight model tier ({provenance.provider}).</span>
			</div>
			{#if onRegeneratePage}
				<button
					type="button"
					onclick={onRegeneratePage}
					class="text-xs font-bold text-amber-300 hover:text-amber-200 cursor-pointer underline"
				>
					Regenerate with Full AI
				</button>
			{/if}
		</div>
	{/if}

	<!-- Table of Contents Flyout Modal -->
	{#if showToc}
		<div
			class="gap-2 rounded-2xl p-4 flex flex-col border border-border bg-surface shadow-lg {zenMode
				? 'max-w-4xl mx-auto w-full'
				: ''}"
		>
			<div class="pb-2 flex items-center justify-between border-b border-border/60">
				<h4 class="font-display text-xs font-bold text-text">Lesson Outline</h4>
				<button
					type="button"
					onclick={() => (showToc = false)}
					class="text-xs cursor-pointer text-text-muted hover:text-text"
				>
					✕
				</button>
			</div>
			<div class="gap-1.5 flex flex-col">
				{#each pages as page, idx (page.order || idx)}
					<button
						type="button"
						onclick={() => {
							onPageChange(idx);
							showToc = false;
						}}
						class="px-3 py-2 text-xs flex cursor-pointer items-center justify-between rounded-xl text-left transition-colors {idx ===
						currentPageIndex
							? 'font-bold text-white shadow-xs bg-primary'
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
		class="lesson-content-area gap-6 rounded-3xl p-6 sm:p-10 flex flex-col border border-border bg-surface shadow-sm {zenMode
			? 'max-w-4xl mx-auto w-full'
			: ''}"
	>
		{#if activePage}
			<!-- Heading & Reading Metadata -->
			<div class="gap-2 pb-4 flex flex-col border-b border-border/60">
				<div class="text-xs flex items-center justify-between text-text-muted">
					<span class="font-bold text-primary uppercase"
						>Page {currentPageIndex + 1} of {pages.length}</span
					>
					<span>⏱️ ~{estReadingMins} min read</span>
				</div>
				<h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl text-text">
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
								class="my-6 rounded-2xl p-4 shadow-xs border border-border/80 bg-surface-muted/60"
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
	<div class="pt-2 flex items-center justify-between {zenMode ? 'max-w-4xl mx-auto w-full' : ''}">
		<button
			type="button"
			onclick={handlePrevPage}
			disabled={currentPageIndex === 0}
			class="gap-2 rounded-2xl px-5 py-3 text-xs font-bold shadow-2xs inline-flex cursor-pointer items-center border border-border bg-surface text-text transition-all hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
		>
			<span>&larr; Previous Page</span>
		</button>

		<button
			type="button"
			onclick={handleNextPage}
			class="gap-2 rounded-2xl px-6 py-3 text-xs font-bold text-white inline-flex cursor-pointer items-center bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
		>
			<span>{currentPageIndex < pages.length - 1 ? 'Next Page &rarr;' : 'Complete Lesson 🎉'}</span>
		</button>
	</div>
</div>
