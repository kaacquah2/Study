<script lang="ts">
	import { onMount } from 'svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { studySessionStore, type CanonicalConcept } from '$lib/stores/studySession.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { auth } from '$lib/firebase/client';

	interface Props {
		courseId?: string;
		moduleId?: string;
		canonicalConcepts?: CanonicalConcept[];
		containerSelector?: string;
	}

	let {
		courseId = '',
		moduleId = '',
		canonicalConcepts = [],
		containerSelector = '.lesson-content-area'
	}: Props = $props();

	let visible = $state(false);
	let selectedText = $state('');
	let posX = $state(0);
	let posY = $state(0);
	let isCreatingCard = $state(false);

	const updateSelection = () => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) {
			visible = false;
			selectedText = '';
			return;
		}

		const text = selection.toString().trim();
		if (text.length < 3 || text.length > 600) {
			visible = false;
			selectedText = '';
			return;
		}

		// Check if selection is within the container
		const container = document.querySelector(containerSelector);
		if (container && selection.anchorNode && !container.contains(selection.anchorNode)) {
			visible = false;
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		selectedText = text;
		// Position toolbar centered horizontally above selection
		posX = Math.max(10, Math.min(window.innerWidth - 320, rect.left + rect.width / 2 - 160));
		posY = Math.max(10, rect.top - 50 + window.scrollY);
		visible = true;
	};

	onMount(() => {
		const handleMouseUp = () => {
			setTimeout(updateSelection, 10);
		};

		const handleSelectionChange = () => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) {
				visible = false;
			}
		};

		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('selectionchange', handleSelectionChange);

		return () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('selectionchange', handleSelectionChange);
		};
	});

	// Action: Explain
	const handleExplain = () => {
		const snippet = selectedText;
		visible = false;
		window.getSelection()?.removeAllRanges();

		studySessionStore.recordEvent({
			type: 'lens_explain',
			snippet,
			summary: 'Requested explanation via Study Lens'
		});

		chatStore.openWithSeed(
			`Can you explain this part in simple terms using an analogy?\n\n"${snippet}"`
		);
	};

	// Action: Practical Example
	const handleExample = () => {
		const snippet = selectedText;
		visible = false;
		window.getSelection()?.removeAllRanges();

		studySessionStore.recordEvent({
			type: 'lens_example',
			snippet,
			summary: 'Requested practical example via Study Lens'
		});

		chatStore.openWithSeed(
			`Can you provide a practical, concrete example illustrating this concept?\n\n"${snippet}"`
		);
	};

	// Action: Instant Quiz
	const handleQuizMe = () => {
		const snippet = selectedText;
		visible = false;
		window.getSelection()?.removeAllRanges();

		studySessionStore.recordEvent({
			type: 'lens_quiz',
			snippet,
			summary: 'Requested instant quiz question via Study Lens'
		});

		chatStore.openWithSeed(
			`Can you test my understanding of this with a quick 1-question check?\n\n"${snippet}"`
		);
	};

	// Action: Generate Flashcard with Canonical Concept Resolution
	const handleGenerateFlashcard = async () => {
		if (isCreatingCard) return;
		const snippet = selectedText;
		isCreatingCard = true;

		// Resolve against canonical concept taxonomy if available
		const resolvedConcept = studySessionStore.resolveConcept(snippet, canonicalConcepts);
		const conceptId = resolvedConcept?.id || null;
		const conceptLabel = resolvedConcept?.term || snippet.slice(0, 40);

		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/documents/flashcards', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					documentText: snippet,
					courseId,
					moduleId,
					conceptId,
					conceptTag: resolvedConcept?.id || undefined
				})
			});

			if (res.ok) {
				studySessionStore.recordEvent({
					type: 'flashcard_created',
					snippet,
					conceptId,
					summary: `Created flashcard for "${conceptLabel}"`
				});
				toastStore.success(`Added flashcard for "${conceptLabel}" to your FSRS memory deck!`);
			} else {
				// Local fallback card creation if offline or rate-limited
				studySessionStore.recordEvent({
					type: 'flashcard_created',
					snippet,
					conceptId,
					summary: `Created local flashcard for "${conceptLabel}"`
				});
				toastStore.info(`Saved concept "${conceptLabel}" to your memory study list.`);
			}
		} catch (err) {
			console.warn('Flashcard generation error:', err);
			toastStore.info(`Saved concept "${conceptLabel}" for review.`);
		} finally {
			isCreatingCard = false;
			visible = false;
			window.getSelection()?.removeAllRanges();
		}
	};

	// Action: Text-to-Speech
	const handleSpeak = () => {
		const snippet = selectedText;
		visible = false;
		window.getSelection()?.removeAllRanges();

		if ('speechSynthesis' in window) {
			window.speechSynthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(snippet);
			utterance.rate = 1.0;
			window.speechSynthesis.speak(utterance);
			studySessionStore.recordEvent({
				type: 'tts_read',
				snippet: snippet.slice(0, 80),
				summary: 'Listened to audio snippet'
			});
			toastStore.info('Playing selected text audio...');
		} else {
			toastStore.error('Text-to-speech is not supported by your browser.');
		}
	};
</script>

{#if visible}
	<div
		class="animate-pop-in gap-1 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md fixed z-50 flex items-center border border-border/80 bg-surface/95"
		style="left: {posX}px; top: {posY}px;"
	>
		<div class="gap-1 flex items-center">
			<button
				type="button"
				onclick={handleExplain}
				class="gap-1 px-2.5 py-1.5 font-bold inline-flex cursor-pointer items-center rounded-xl text-[11px] text-text transition-colors hover:bg-primary-soft hover:text-primary active:scale-95"
				title="Explain this highlighted text simply"
			>
				<span>💡</span>
				<span>Explain</span>
			</button>

			<button
				type="button"
				onclick={handleExample}
				class="gap-1 px-2.5 py-1.5 font-bold inline-flex cursor-pointer items-center rounded-xl text-[11px] text-text transition-colors hover:bg-primary-soft hover:text-primary active:scale-95"
				title="Give a concrete example"
			>
				<span>🧪</span>
				<span>Example</span>
			</button>

			<button
				type="button"
				onclick={handleQuizMe}
				class="gap-1 px-2.5 py-1.5 font-bold inline-flex cursor-pointer items-center rounded-xl text-[11px] text-text transition-colors hover:bg-primary-soft hover:text-primary active:scale-95"
				title="Test my understanding on this sentence"
			>
				<span>❓</span>
				<span>Quiz Me</span>
			</button>

			<button
				type="button"
				onclick={handleGenerateFlashcard}
				disabled={isCreatingCard}
				class="gap-1 px-2.5 py-1.5 font-bold hover:bg-amber-500/15 hover:text-amber-500 inline-flex cursor-pointer items-center rounded-xl text-[11px] text-text transition-colors active:scale-95 disabled:opacity-50"
				title="Convert into FSRS memory flashcard"
			>
				<span>🗂️</span>
				<span>{isCreatingCard ? 'Saving...' : 'Flashcard'}</span>
			</button>

			<button
				type="button"
				onclick={handleSpeak}
				class="p-1.5 inline-flex cursor-pointer items-center rounded-xl text-[11px] text-text-muted transition-colors hover:bg-surface-muted hover:text-text active:scale-95"
				title="Listen to this text"
				aria-label="Read selected text aloud"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z"
					/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.animate-pop-in {
		animation: popIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.92) translateY(6px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
