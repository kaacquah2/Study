<script lang="ts">
	import { auth } from '$lib/firebase/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	// ── State ──────────────────────────────────────────────────────────────────
	let chunkCount = $state(0);
	let hasDocuments = $state(false);
	let statsLoading = $state(true);

	// Upload state
	let pasteText = $state('');
	let uploading = $state(false);
	let uploadError = $state('');
	let dragOver = $state(false);

	// Staged files: list of { name, content } objects
	let stagedFiles = $state<{ name: string; content: string }[]>([]);

	// Active Tab State
	let activeTab = $state<'documents' | 'summarizer' | 'paraphraser' | 'flashcards'>('documents');

	// Clear confirmation
	let showClearConfirm = $state(false);
	let clearing = $state(false);

	// ── Summarizer State & Action ──────────────────────────────────────────────
	let summarizeText = $state('');
	let summaryResult = $state('');
	let summaryProvider = $state('');
	let summarizing = $state(false);

	async function handleSummarize() {
		if (summarizeText.trim().length < 50) {
			toastStore.error('Text must be at least 50 characters.');
			return;
		}
		summarizing = true;
		summaryResult = '';
		try {
			const token = await getToken();
			const res = await fetch('/api/summarize', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ text: summarizeText })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Summarization failed');
			summaryResult = data.summary;
			summaryProvider = data.provider || '';
			toastStore.success('Summary generated successfully!');
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Summarization failed');
		} finally {
			summarizing = false;
		}
	}

	// ── Paraphraser State & Action ──────────────────────────────────────────────
	let paraphraseText = $state('');
	let paraphraseStyle = $state<'academic' | 'simple' | 'formal'>('academic');
	let paraphraseResult = $state('');
	let paraphraseProvider = $state('');
	let paraphrasing = $state(false);

	async function handleParaphrase() {
		if (paraphraseText.trim().length < 10) {
			toastStore.error('Text must be at least 10 characters.');
			return;
		}
		paraphrasing = true;
		paraphraseResult = '';
		try {
			const token = await getToken();
			const res = await fetch('/api/paraphrase', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ text: paraphraseText, style: paraphraseStyle })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Paraphrasing failed');
			paraphraseResult = data.paraphrase;
			paraphraseProvider = data.provider || '';
			toastStore.success('Text paraphrased successfully!');
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Paraphrasing failed');
		} finally {
			paraphrasing = false;
		}
	}

	// ── Flashcard Generator State & Action ────────────────────────────────────
	let flashcardText = $state('');
	let generatedCards = $state<Array<{ front: string; back: string }>>([]);
	let generatingCards = $state(false);

	async function handleGenerateFlashcards() {
		if (flashcardText.trim().length < 50) {
			toastStore.error('Document text must be at least 50 characters.');
			return;
		}
		generatingCards = true;
		generatedCards = [];
		try {
			const token = await getToken();
			const res = await fetch('/api/documents/flashcards', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ documentText: flashcardText })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error?.message || 'Flashcards generation failed');
			generatedCards = data.flashcards || [];
			toastStore.success(`Created ${generatedCards.length} flashcards in your deck!`);
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Flashcards generation failed');
		} finally {
			generatingCards = false;
		}
	}

	// ── Auth helper ───────────────────────────────────────────────────────────
	async function getToken(): Promise<string> {
		const token = await auth.currentUser?.getIdToken();
		if (!token) throw new Error('Not authenticated');
		return token;
	}

	// ── Load Stats ────────────────────────────────────────────────────────────
	async function loadStats() {
		statsLoading = true;
		try {
			const token = await getToken();
			const res = await fetch('/api/documents', {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (res.ok) {
				const data = await res.json();
				chunkCount = data.chunk_count ?? 0;
				hasDocuments = data.has_documents ?? false;
			}
		} catch (e) {
			console.error('Failed to load RAG stats:', e);
		} finally {
			statsLoading = false;
		}
	}

	onMount(() => {
		loadStats();
	});

	// ── File Drop / Pick ──────────────────────────────────────────────────────
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = Array.from(e.dataTransfer?.files || []);
		readFiles(files);
	}

	function handleFilePick(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);
		readFiles(files);
		input.value = '';
	}

	function extractPdfText(buffer: ArrayBuffer): string {
		const decoder = new TextDecoder('utf-8', { fatal: false });
		const raw = decoder.decode(buffer);
		// Match text tokens in PDF Tj or TJ operator structures
		const matches = raw.match(/\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g);
		if (matches && matches.length > 0) {
			const extracted = matches
				.map((m) => m.replace(/^[([]|[)]]\s*T[jJ]$/g, '').replace(/\\/g, ''))
				.filter((t) => t.trim().length > 1)
				.join(' ');
			if (extracted.length >= 20) return extracted;
		}
		// Fallback clean extraction for PDF text streams
		const cleanText = raw
			.replace(/%PDF-[\s\S]*?stream/g, ' ')
			.replace(/endstream[\s\S]*?endobj/g, ' ')
			.replace(/[^\x20-\x7E\n]/g, ' ')
			.replace(/\s+/g, ' ');
		return cleanText.trim();
	}

	function readFiles(files: File[]) {
		const supportedExts = ['.txt', '.md', '.pdf', '.json', '.csv'];
		const supported = files.filter((f) =>
			supportedExts.some((ext) => f.name.toLowerCase().endsWith(ext))
		);
		if (supported.length !== files.length) {
			toastStore.error('Supported formats: .pdf, .txt, .md, .json, .csv');
		}
		supported.forEach((file) => {
			const isPdf = file.name.toLowerCase().endsWith('.pdf');
			const reader = new FileReader();
			reader.onload = () => {
				let content = '';
				if (isPdf && reader.result instanceof ArrayBuffer) {
					content = extractPdfText(reader.result);
				} else if (typeof reader.result === 'string') {
					content = reader.result.trim();
				}
				if (content.length < 20) {
					toastStore.error(`${file.name} is empty or has insufficient text content to index.`);
					return;
				}
				if (stagedFiles.some((f) => f.name === file.name)) {
					toastStore.error(`${file.name} is already staged.`);
					return;
				}
				stagedFiles = [...stagedFiles, { name: file.name, content }];
				toastStore.success(`Staged: ${file.name}`);
			};

			if (isPdf) {
				reader.readAsArrayBuffer(file);
			} else {
				reader.readAsText(file);
			}
		});
	}

	function addPasteText() {
		const text = pasteText.trim();
		if (text.length < 20) {
			uploadError = 'Text must be at least 20 characters.';
			return;
		}
		const name = `Pasted text (${new Date().toLocaleTimeString()})`;
		stagedFiles = [...stagedFiles, { name, content: text }];
		pasteText = '';
		uploadError = '';
		toastStore.success('Text staged for upload.');
	}

	function removeStaged(index: number) {
		stagedFiles = stagedFiles.filter((_, i) => i !== index);
	}

	// ── Upload ────────────────────────────────────────────────────────────────
	async function uploadAll() {
		if (stagedFiles.length === 0) return;
		uploading = true;
		uploadError = '';
		try {
			const token = await getToken();
			const res = await fetch('/api/documents', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ texts: stagedFiles.map((f) => f.content) })
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error?.message || 'Upload failed');
			}
			toastStore.success(
				`✓ ${data.chunks_added} chunks indexed from ${stagedFiles.length} document${stagedFiles.length > 1 ? 's' : ''}`
			);
			stagedFiles = [];
			await loadStats();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
			toastStore.error(uploadError);
		} finally {
			uploading = false;
		}
	}

	// ── Clear Store ───────────────────────────────────────────────────────────
	async function clearStore() {
		clearing = true;
		try {
			const token = await getToken();
			const res = await fetch('/api/documents', {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error?.message || 'Clear failed');
			}
			toastStore.success('Knowledge base cleared.');
			showClearConfirm = false;
			await loadStats();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Clear failed');
		} finally {
			clearing = false;
		}
	}
</script>

<svelte:head>
	<title>Knowledge Base — AI Study Buddy</title>
</svelte:head>

<div class="max-w-3xl gap-6 py-4 mx-auto flex w-full flex-col">
	<!-- Header -->
	<div class="pb-4 flex items-center justify-between border-b border-border">
		<div>
			<a
				href={resolve('/app')}
				class="gap-1.5 text-xs font-bold inline-flex items-center text-text-muted transition-colors hover:text-primary"
			>
				&larr; Return to Dashboard
			</a>
			<h1 class="mt-1 font-display text-2xl font-bold text-text">Knowledge Base</h1>
			<p class="mt-0.5 text-xs text-text-muted">
				Upload study materials to improve AI lesson &amp; quiz generation quality.
			</p>
		</div>
	</div>

	<!-- Stats Bar -->
	<div class="gap-3 sm:grid-cols-3 grid grid-cols-2">
		<div class="rounded-2xl p-4 border border-border bg-surface">
			<p class="font-bold tracking-wider text-[11px] text-text-muted uppercase">Indexed Chunks</p>
			{#if statsLoading}
				<div class="mt-1 h-6 w-16 animate-pulse rounded-lg bg-surface-muted"></div>
			{:else}
				<p class="mt-1 font-display text-2xl font-bold text-primary">
					{chunkCount.toLocaleString()}
				</p>
			{/if}
		</div>
		<div class="rounded-2xl p-4 border border-border bg-surface">
			<p class="font-bold tracking-wider text-[11px] text-text-muted uppercase">RAG Status</p>
			{#if statsLoading}
				<div class="mt-1 h-6 w-20 animate-pulse rounded-lg bg-surface-muted"></div>
			{:else}
				<p
					class="mt-1 font-display text-sm font-bold {hasDocuments
						? 'text-success'
						: 'text-text-muted'}"
				>
					{hasDocuments ? '✓ Active' : 'No documents'}
				</p>
			{/if}
		</div>
		<div class="rounded-2xl p-4 sm:col-span-1 col-span-2 border border-border bg-surface">
			<p class="font-bold tracking-wider text-[11px] text-text-muted uppercase">Chunk Size</p>
			<p class="mt-1 font-display text-sm font-bold text-text">400 chars / 50 overlap</p>
		</div>
	</div>

	<!-- Tab Bar Navigation -->
	<div class="gap-2 pb-3 flex flex-wrap items-center border-b border-border">
		<button
			type="button"
			onclick={() => (activeTab = 'documents')}
			class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl transition-all {activeTab ===
			'documents'
				? 'text-white shadow-xs bg-primary'
				: 'border border-border bg-surface text-text-muted hover:text-text'}"
		>
			📚 RAG Knowledge Base
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'summarizer')}
			class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl transition-all {activeTab ===
			'summarizer'
				? 'text-white shadow-xs bg-primary'
				: 'border border-border bg-surface text-text-muted hover:text-text'}"
		>
			⚡ Summarizer
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'paraphraser')}
			class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl transition-all {activeTab ===
			'paraphraser'
				? 'text-white shadow-xs bg-primary'
				: 'border border-border bg-surface text-text-muted hover:text-text'}"
		>
			✍️ Paraphraser
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'flashcards')}
			class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl transition-all {activeTab ===
			'flashcards'
				? 'text-white shadow-xs bg-primary'
				: 'border border-border bg-surface text-text-muted hover:text-text'}"
		>
			🎴 Flashcard Generator
		</button>
	</div>

	{#if activeTab === 'documents'}
		<!-- How it works banner -->
		<div
			class="rounded-2xl p-4 text-xs leading-relaxed border border-primary/20 bg-primary-soft/40 text-primary"
		>
			<span class="font-bold">How it works:</span> Documents you upload are split into chunks, embedded
			with a semantic model, and stored in a FAISS index on disk. When you generate lessons or quizzes,
			the AI retrieves the most relevant chunks and uses them as grounded context — producing far more
			accurate and specific content.
		</div>

		<!-- Upload Section -->
		<div class="gap-4 rounded-2xl p-6 flex flex-col border border-border bg-surface shadow-sm">
			<h2 class="font-display text-base font-bold text-text">Add Documents</h2>

			<!-- Drag & Drop Zone -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="gap-3 p-8 relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors
				{dragOver
					? 'border-primary bg-primary-soft/30'
					: 'border-border bg-surface-muted/50 hover:border-primary/50'}"
				ondragover={(e) => {
					e.preventDefault();
					dragOver = true;
				}}
				ondragleave={() => {
					dragOver = false;
				}}
				ondrop={handleDrop}
			>
				<div class="h-12 w-12 rounded-2xl flex items-center justify-center bg-primary-soft">
					<svg
						class="h-6 w-6 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						/>
					</svg>
				</div>
				<div>
					<p class="text-sm font-bold text-text">Drag &amp; drop files here</p>
					<p class="text-xs text-text-muted">
						Supports <code class="rounded px-1 font-mono bg-surface-muted">.pdf</code>,
						<code class="rounded px-1 font-mono bg-surface-muted">.txt</code>,
						<code class="rounded px-1 font-mono bg-surface-muted">.md</code>,
						<code class="rounded px-1 font-mono bg-surface-muted">.json</code>, and
						<code class="rounded px-1 font-mono bg-surface-muted">.csv</code> files
					</p>
				</div>
				<label
					class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary hover:text-primary"
				>
					Browse Files
					<input
						type="file"
						accept=".txt,.md,.pdf,.json,.csv"
						multiple
						class="hidden"
						onchange={handleFilePick}
					/>
				</label>
			</div>

			<!-- Paste Text -->
			<div class="gap-2 pt-4 flex flex-col border-t border-border/40">
				<label for="paste-input" class="text-xs font-bold tracking-wider text-text-muted uppercase">
					Or paste text directly
				</label>
				<textarea
					id="paste-input"
					bind:value={pasteText}
					rows="4"
					placeholder="Paste lecture notes, textbook excerpts, or any study material here..."
					class="px-4 py-3 text-xs leading-relaxed w-full resize-none rounded-xl border border-border bg-surface-muted/50 text-text focus:border-primary focus:outline-none"
				></textarea>
				{#if uploadError}
					<p class="font-semibold text-[11px] text-danger">{uploadError}</p>
				{/if}
				<div class="flex justify-end">
					<button
						type="button"
						onclick={addPasteText}
						disabled={pasteText.trim().length < 20}
						class="px-4 py-2 text-xs font-bold cursor-pointer rounded-xl border border-border bg-surface text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
					>
						+ Stage Text
					</button>
				</div>
			</div>
		</div>

		<!-- Staged Files Queue -->
		{#if stagedFiles.length > 0}
			<div class="gap-3 rounded-2xl p-6 flex flex-col border border-border bg-surface shadow-sm">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-base font-bold text-text">
						Staged for Upload
						<span
							class="ml-1.5 h-5 w-5 font-bold text-white inline-flex items-center justify-center rounded-full bg-primary text-[10px]"
						>
							{stagedFiles.length}
						</span>
					</h2>
					<button
						type="button"
						onclick={() => {
							stagedFiles = [];
						}}
						class="text-xs font-bold text-text-muted transition-colors hover:text-danger"
					>
						Clear all
					</button>
				</div>

				<ul class="gap-2 flex flex-col">
					{#each stagedFiles as file, i (file.name + i)}
						<li
							class="gap-3 px-4 py-2.5 flex items-center justify-between rounded-xl border border-border bg-surface-muted/50"
						>
							<div class="min-w-0 gap-2 flex items-center">
								<svg
									class="h-4 w-4 shrink-0 text-primary"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								<span class="text-xs font-semibold truncate text-text">{file.name}</span>
							</div>
							<div class="gap-3 flex shrink-0 items-center">
								<span class="text-[11px] text-text-muted"
									>{(file.content.length / 1000).toFixed(1)}k chars</span
								>
								<button
									type="button"
									onclick={() => removeStaged(i)}
									class="text-text-muted transition-colors hover:text-danger"
									aria-label="Remove {file.name}"
								>
									<svg
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</li>
					{/each}
				</ul>

				<button
					type="button"
					onclick={uploadAll}
					disabled={uploading}
					class="gap-2 px-6 py-3 text-xs font-bold text-white inline-flex w-full items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
				>
					{#if uploading}
						<span
							class="h-4 w-4 animate-spin border-white rounded-full border-2 border-t-transparent"
						></span>
						Indexing documents...
					{:else}
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
							/>
						</svg>
						Index {stagedFiles.length} Document{stagedFiles.length > 1 ? 's' : ''}
					{/if}
				</button>
			</div>
		{/if}

		<!-- Danger Zone — Clear Store -->
		<div class="gap-3 rounded-2xl p-6 flex flex-col border border-danger/20 bg-danger-soft/30">
			<div>
				<h2 class="font-display text-base font-bold text-danger">Danger Zone</h2>
				<p class="mt-0.5 text-xs text-text-muted">
					Clearing the knowledge base permanently deletes all indexed document chunks from the FAISS
					vector store. Sample documents will be re-seeded on next server restart.
				</p>
			</div>

			{#if !showClearConfirm}
				<button
					type="button"
					onclick={() => {
						showClearConfirm = true;
					}}
					disabled={!hasDocuments}
					class="gap-2 px-4 py-2 text-xs font-bold inline-flex items-center self-start rounded-xl border border-danger/40 bg-danger-soft text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
					Clear Knowledge Base
				</button>
			{:else}
				<div class="gap-2 flex flex-col">
					<p class="text-xs font-bold text-danger">
						Are you sure? This will delete all {chunkCount.toLocaleString()} indexed chunks.
					</p>
					<div class="gap-2 flex">
						<button
							type="button"
							onclick={clearStore}
							disabled={clearing}
							class="gap-2 px-4 py-2 text-xs font-bold text-white inline-flex items-center rounded-xl bg-danger transition-colors hover:opacity-90 disabled:opacity-60"
						>
							{#if clearing}
								<span
									class="h-3 w-3 animate-spin border-white rounded-full border-2 border-t-transparent"
								></span>
								Clearing...
							{:else}
								Yes, Clear Everything
							{/if}
						</button>
						<button
							type="button"
							onclick={() => {
								showClearConfirm = false;
							}}
							class="px-4 py-2 text-xs font-bold rounded-xl border border-border text-text-muted transition-colors hover:text-text"
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Tips -->
		<div
			class="rounded-2xl p-5 text-xs leading-relaxed border border-border bg-surface text-text-muted"
		>
			<p class="mb-2 font-bold text-text">Tips for best results</p>
			<ul class="gap-1.5 flex list-inside list-disc flex-col">
				<li>Upload topic-specific materials that match what you'll be generating courses about</li>
				<li>
					Longer, well-structured documents (textbook chapters, lecture notes) produce the best
					grounding
				</li>
				<li>
					The knowledge base is <span class="font-semibold text-text"
						>shared across all your courses</span
					> — it's not per-course
				</li>
				<li>Documents persist on disk across ML backend restarts</li>
				<li>
					You can also use the <code class="rounded px-1 font-mono bg-surface-muted"
						>build_index.py</code
					> script to bulk-index a folder of files
				</li>
			</ul>
		</div>
	{:else if activeTab === 'summarizer'}
		<!-- Summarizer Panel -->
		<div class="gap-4 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
			<div>
				<h2 class="font-display text-lg font-bold text-text">Text Summarizer</h2>
				<p class="text-xs text-text-muted">
					Generate concise AI summaries from textbook passages or notes.
				</p>
			</div>
			<textarea
				bind:value={summarizeText}
				placeholder="Paste text to summarize (minimum 50 characters)..."
				class="min-h-36 p-4 font-sans text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:ring-2 focus:ring-primary focus:outline-none"
			></textarea>
			<div class="flex items-center justify-between">
				<span class="text-[11px] text-text-muted">{summarizeText.length} characters</span>
				<button
					type="button"
					onclick={handleSummarize}
					disabled={summarizing || summarizeText.trim().length < 50}
					class="px-5 py-2.5 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover disabled:opacity-50"
				>
					{summarizing ? 'Summarizing...' : 'Generate Summary'}
				</button>
			</div>
			{#if summaryResult}
				<div class="mt-4 p-4 rounded-xl border border-primary/20 bg-primary-soft/30">
					<div class="mb-2 flex items-center justify-between">
						<span class="font-bold text-[11px] text-primary uppercase">Summary Output</span>
						{#if summaryProvider}
							<span class="text-[10px] text-text-muted">Powered by {summaryProvider}</span>
						{/if}
					</div>
					<p class="text-xs leading-relaxed whitespace-pre-wrap text-text">{summaryResult}</p>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'paraphraser'}
		<!-- Paraphraser Panel -->
		<div class="gap-4 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
			<div>
				<h2 class="font-display text-lg font-bold text-text">Text Paraphraser</h2>
				<p class="text-xs text-text-muted">
					Rewrite study notes into Academic, Simple, or Formal styles.
				</p>
			</div>
			<div class="gap-2 flex items-center">
				<span class="text-xs font-bold text-text-muted">Select Tone:</span>
				{#each ['academic', 'simple', 'formal'] as const as s (s)}
					<button
						type="button"
						onclick={() => (paraphraseStyle = s)}
						class="px-3 py-1 text-xs font-bold cursor-pointer rounded-lg capitalize transition-all {paraphraseStyle ===
						s
							? 'text-white bg-primary'
							: 'border border-border bg-surface-muted text-text-muted'}"
					>
						{s}
					</button>
				{/each}
			</div>
			<textarea
				bind:value={paraphraseText}
				placeholder="Paste text to paraphrase (minimum 10 characters)..."
				class="min-h-32 p-4 font-sans text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:ring-2 focus:ring-primary focus:outline-none"
			></textarea>
			<div class="flex items-center justify-between">
				<span class="text-[11px] text-text-muted">{paraphraseText.length} characters</span>
				<button
					type="button"
					onclick={handleParaphrase}
					disabled={paraphrasing || paraphraseText.trim().length < 10}
					class="px-5 py-2.5 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover disabled:opacity-50"
				>
					{paraphrasing ? 'Paraphrasing...' : 'Paraphrase Text'}
				</button>
			</div>
			{#if paraphraseResult}
				<div class="mt-4 p-4 rounded-xl border border-primary/20 bg-primary-soft/30">
					<div class="mb-2 flex items-center justify-between">
						<span class="font-bold text-[11px] text-primary uppercase"
							>{paraphraseStyle} Paraphrase</span
						>
						{#if paraphraseProvider}
							<span class="text-[10px] text-text-muted">Powered by {paraphraseProvider}</span>
						{/if}
					</div>
					<p class="text-xs leading-relaxed whitespace-pre-wrap text-text">{paraphraseResult}</p>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'flashcards'}
		<!-- Flashcards Generator Panel -->
		<div class="gap-4 rounded-2xl p-6 shadow-xs flex flex-col border border-border bg-surface">
			<div>
				<h2 class="font-display text-lg font-bold text-text">AI Flashcard Generator</h2>
				<p class="text-xs text-text-muted">
					Extract atomic spaced-repetition flashcards directly from study text.
				</p>
			</div>
			<textarea
				bind:value={flashcardText}
				placeholder="Paste textbook excerpt or notes to extract flashcards (minimum 50 characters)..."
				class="min-h-36 p-4 font-sans text-xs w-full rounded-xl border border-border bg-surface-muted text-text focus:ring-2 focus:ring-primary focus:outline-none"
			></textarea>
			<div class="flex items-center justify-between">
				<span class="text-[11px] text-text-muted">{flashcardText.length} characters</span>
				<button
					type="button"
					onclick={handleGenerateFlashcards}
					disabled={generatingCards || flashcardText.trim().length < 50}
					class="px-5 py-2.5 text-xs font-bold text-white cursor-pointer rounded-xl bg-primary transition-all hover:bg-primary-hover disabled:opacity-50"
				>
					{generatingCards ? 'Generating Flashcards...' : 'Generate Flashcards'}
				</button>
			</div>
			{#if generatedCards.length > 0}
				<div class="mt-4 gap-3 flex flex-col">
					<span class="text-xs font-bold text-text"
						>Generated Flashcards ({generatedCards.length})</span
					>
					<div class="gap-3 sm:grid-cols-2 grid grid-cols-1">
						{#each generatedCards as card, idx (idx)}
							<div
								class="gap-2 p-4 shadow-2xs flex flex-col rounded-xl border border-border bg-surface-muted"
							>
								<span class="font-bold text-[10px] text-primary uppercase">Card #{idx + 1}</span>
								<p class="text-xs font-bold text-text">Q: {card.front}</p>
								<p class="text-xs text-text-muted">A: {card.back}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
