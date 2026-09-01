<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { auth } from '$lib/firebase/client';
	import { page } from '$app/state';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { renderSanitizedMarkdown } from '$lib/utils/markdown';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface RAGSourceCitation {
		chunkId?: string;
		sourceTitle: string;
		pageNumber?: number;
		chapter?: string;
		section?: string;
		sourceType?: 'uploaded_document' | 'generated_lesson' | 'web_content';
	}

	interface RawSourcePayload {
		pageTitle?: string;
		sourceTitle?: string;
		pageNumber?: number;
		chapter?: string;
		section?: string;
		sourceType?: 'uploaded_document' | 'generated_lesson' | 'web_content';
	}

	interface Message {
		role: 'user' | 'assistant';
		content: string;
		sources?: RAGSourceCitation[];
		sourceSupport?: 'strong' | 'limited' | 'none';
		isError?: boolean;
	}

	// State using Svelte 5 runes
	let messages = $state<Message[]>([
		{
			role: 'assistant',
			content:
				'Hi! I am your AI Study Tutor. Choose a learning mode below or ask me any question about your courses.'
		}
	]);
	let inputMessage = $state('');
	let loading = $state(false);
	let socraticMode = $state(true);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	// User-dismissable context state
	let contextDismissed = $state(false);

	// Resizing state
	let isResizing = $state(false);

	// Derive route params
	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.moduleId || page.params.mid);

	// Active study context
	let activeContextLabel = $derived.by(() => {
		if (contextDismissed) return null;
		if (studySessionStore.activeHeading) {
			return studySessionStore.activeHeading;
		}
		if (moduleId) {
			return `Module ${moduleId}`;
		}
		if (courseId) {
			return `Course Workspace`;
		}
		return null;
	});

	// Sync active module with studySessionStore and chatStore
	$effect(() => {
		if (moduleId) {
			chatStore.activeModuleId = moduleId;
			studySessionStore.setModule(moduleId);
		}
	});

	// Sync with chatStore seed message
	$effect(() => {
		if (chatStore.seedMessage) {
			inputMessage = chatStore.seedMessage;
			chatStore.seedMessage = '';
			if (!chatStore.isOpen) {
				chatStore.isOpen = true;
			}
		}
	});

	$effect(() => {
		if (chatStore.isOpen) {
			scrollToBottom();
		}
	});

	const toggleDrawer = () => {
		chatStore.toggle();
		if (chatStore.isOpen) {
			scrollToBottom();
		}
	};

	const toggleDock = () => {
		chatStore.setDocked(!chatStore.isDocked);
	};

	const scrollToBottom = () => {
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 60);
	};

	// 6 Structured Quick-Start Mode Cards
	const tutorModes = [
		{
			icon: '💡',
			title: 'Explain Concept',
			desc: 'Plain English explanation with relatable intuition',
			prompt: 'Can you explain the main concept in simple, intuitive terms?'
		},
		{
			icon: '❓',
			title: 'Quiz Me',
			desc: 'Interactive check question with reasoning',
			prompt:
				'Can you give me a focused multiple-choice practice question to test my understanding?'
		},
		{
			icon: '🧪',
			title: 'Practical Example',
			desc: 'Real-world application and walk-through',
			prompt: 'Can you provide a concrete, real-world example or practical scenario of this?'
		},
		{
			icon: '🔍',
			title: 'Review Tricky Areas',
			desc: 'Common mistakes and edge cases',
			prompt: 'What are the most common mistakes, pitfalls, and misconceptions students make here?'
		},
		{
			icon: '📝',
			title: 'Key Takeaways',
			desc: 'Top 3 high-yield summary points',
			prompt: 'What are the top 3 high-yield takeaways I must remember from this topic?'
		},
		{
			icon: '🪜',
			title: 'Teach Step-by-Step',
			desc: 'Structured guided walkthrough',
			prompt: 'Can you guide me step-by-step from fundamentals to advanced nuance?'
		}
	];

	// Quick-Action Prompt Chips
	const promptChips = [
		{
			label: '💡 Analogy',
			prompt: 'Can you explain this concept using a simple real-world analogy?'
		},
		{
			label: '🧪 Example',
			prompt: 'Can you give me a concrete, practical code or real-world example?'
		},
		{
			label: '❓ Quiz Me',
			prompt: 'Can you give me a quick 1-question check to test my understanding?'
		},
		{
			label: '📝 Takeaways',
			prompt: 'What are the 3 most important key takeaways from this topic?'
		}
	];

	const handleChipClick = (prompt: string) => {
		inputMessage = prompt;
		handleSend();
	};

	const handleCopyMessage = async (content: string) => {
		try {
			await navigator.clipboard.writeText(content);
			toastStore.success('Copied to clipboard!');
		} catch {
			toastStore.error('Failed to copy text.');
		}
	};

	const clearChat = () => {
		messages = [
			{
				role: 'assistant',
				content: 'Chat refreshed. What would you like to study next?'
			}
		];
	};

	// Drag to resize handler
	const handleMouseDownResize = (e: MouseEvent) => {
		if (!chatStore.isDocked) return;
		e.preventDefault();
		isResizing = true;

		const startX = e.clientX;
		const startWidth = chatStore.dockWidth;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!isResizing) return;
			const deltaX = startX - moveEvent.clientX;
			chatStore.setDockWidth(startWidth + deltaX);
		};

		const handleMouseUp = () => {
			isResizing = false;
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	};

	// Send message
	const handleSend = async () => {
		const text = inputMessage.trim();
		if (!text || loading) return;

		inputMessage = '';
		messages = [...messages, { role: 'user', content: text }];
		loading = true;
		scrollToBottom();

		// Record interaction in session working memory
		studySessionStore.recordEvent({
			type: 'lens_explain',
			snippet: text.slice(0, 100),
			summary: 'User asked chat question'
		});

		try {
			const idToken = await auth.currentUser?.getIdToken();

			// Add initial empty assistant message to receive stream
			messages = [...messages, { role: 'assistant', content: '' }];
			const assistantMessageIndex = messages.length - 1;

			// Fetch recent events from session store (last 15 minutes)
			const recentEvents = studySessionStore.getRecentEvents(15);

			const res = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${idToken}`,
					'Content-Type': 'application/json',
					'X-Client-Theme': themeStore.current,
					'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone
				},
				body: JSON.stringify({
					messages: messages.slice(0, -1).slice(-8),
					courseId: courseId || undefined,
					moduleId: moduleId || undefined,
					socraticMode,
					sessionEvents: recentEvents
				})
			});

			if (!res.ok) {
				const result = await res.json().catch(() => ({}));
				const errMsg =
					res.status === 503 || result.error?.code === 'MODEL_WARMING_UP'
						? 'The AI Study Assistant is currently warming up models in the background. Please wait a few seconds and try again.'
						: res.status === 429
							? result.error?.message ||
								'You have reached the chat rate limit. Please try again later.'
							: result.error?.message || 'AI service error. Please try again shortly.';

				messages = messages.map((m, idx) =>
					idx === assistantMessageIndex ? { ...m, content: errMsg } : m
				);
				return;
			}

			if (res.body) {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (trimmed.startsWith('data: ')) {
							try {
								const payload = JSON.parse(trimmed.slice(6));
								if (payload.type === 'delta' && payload.content) {
									messages = messages.map((m, idx) =>
										idx === assistantMessageIndex
											? { ...m, content: m.content + payload.content }
											: m
									);
									scrollToBottom();
								} else if (payload.type === 'done') {
									const rawSources = payload.sources || [];
									const sourceSupport =
										rawSources.length >= 2
											? 'strong'
											: rawSources.length === 1
												? 'limited'
												: 'none';
									messages = messages.map((m, idx) =>
										idx === assistantMessageIndex
											? {
													...m,
													sources: rawSources.map((s: RawSourcePayload) => ({
														sourceTitle: s.pageTitle || s.sourceTitle || 'Study Document',
														pageNumber: s.pageNumber,
														chapter: s.chapter,
														section: s.section,
														sourceType: s.sourceType || 'uploaded_document'
													})),
													sourceSupport
												}
											: m
									);
								}
							} catch (e) {
								console.error('SSE parse error:', e);
							}
						}
					}
				}
			}
		} catch (err) {
			console.error('Chat error:', err);
			const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
			const isFetchErr = err instanceof TypeError;
			const connectionMsg =
				isOffline || isFetchErr
					? 'Network connection failed. Please check your internet connection and try again.'
					: err instanceof Error
						? err.message
						: 'Unable to send message due to a connection issue.';

			messages = [
				...messages.filter((m) => m.content !== ''),
				{
					role: 'assistant',
					content: connectionMsg,
					isError: true
				}
			];
		} finally {
			loading = false;
			scrollToBottom();
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSend();
		}
	};
</script>

{#if authStore.user}
	<!-- Floating trigger button (Only visible when drawer is completely closed) -->
	{#if !chatStore.isOpen}
		<button
			type="button"
			class="right-6 bottom-20 h-14 w-14 text-white shadow-xl md:right-6 md:bottom-6 fixed z-40 flex cursor-pointer items-center justify-center rounded-full bg-primary transition-all duration-180 hover:scale-105 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
			onclick={toggleDrawer}
			aria-label="Open AI Study Assistant"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-6.5 w-6.5"
			>
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				<path d="M8 10h.01" stroke-width="3" />
				<path d="M16 10h.01" stroke-width="3" />
				<path d="M9 14h6" />
			</svg>
		</button>
	{/if}

	<!-- Chat Panel (Docked or Floating Overlay) -->
	{#if chatStore.isOpen}
		<!-- Mobile backdrop -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#if !chatStore.isDocked}
			<div
				class="inset-0 backdrop-blur-xs md:hidden fixed z-40 bg-text/20"
				onclick={toggleDrawer}
			></div>
		{/if}

		<aside
			class="animate-slide-in shadow-2xl flex flex-col border-l border-border bg-surface transition-all duration-150 {chatStore.isDocked
				? 'relative z-20 h-screen shrink-0 border-l border-border bg-surface'
				: 'top-0 right-0 md:w-96 lg:w-105 fixed z-50 h-full w-full max-w-[calc(100vw-2rem)]'}"
			style={chatStore.isDocked ? `width: ${chatStore.dockWidth}px;` : ''}
		>
			<!-- Resize Drag Handle (Only active when docked on desktop >= 1024px) -->
			{#if chatStore.isDocked}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize chat panel"
					onmousedown={handleMouseDownResize}
					class="group top-0 bottom-0 -left-1.5 w-3 absolute z-30 cursor-col-resize select-none focus:outline-none"
					title="Drag to resize AI Companion width"
				>
					<div
						class="w-1 mx-auto h-full rounded-full transition-colors group-hover:bg-primary {isResizing
							? 'bg-primary'
							: 'bg-transparent'}"
					></div>
				</div>
			{/if}

			<!-- Header -->
			<div class="p-4 flex items-center justify-between border-b border-border">
				<div class="gap-2 flex items-center">
					<div
						class="h-8 w-8 shadow-xs flex items-center justify-center rounded-xl bg-primary-soft text-primary"
					>
						<span class="text-sm">✨</span>
					</div>
					<div>
						<h3 class="font-display text-xs font-bold text-text">AI Study Tutor</h3>
						<div class="gap-2 flex items-center">
							<span class="font-bold tracking-wider text-[10px] text-success uppercase"
								>● Online</span
							>
							<button
								type="button"
								onclick={() => (socraticMode = !socraticMode)}
								class="gap-1 px-2 py-0.5 font-bold inline-flex cursor-pointer items-center rounded-full text-[10px] transition-all {socraticMode
									? 'border border-primary/30 bg-primary-soft text-primary'
									: 'border border-border bg-surface-muted text-text-muted'}"
								title={socraticMode
									? 'Socratic Mode ON: Asks guiding questions'
									: 'Direct Mode: Gives immediate answers'}
							>
								<span>💡</span>
								<span>{socraticMode ? 'Socratic' : 'Direct'}</span>
							</button>
						</div>
					</div>
				</div>

				<div class="gap-1 flex items-center">
					{#if messages.length > 1}
						<button
							type="button"
							onclick={clearChat}
							class="p-1.5 text-xs cursor-pointer rounded-lg text-text-muted hover:bg-surface-muted hover:text-text"
							title="Clear conversation"
							aria-label="Clear chat"
						>
							🔄
						</button>
					{/if}

					<!-- Dock Mode Toggle (Hidden on mobile/tablet < 1024px) -->
					<button
						type="button"
						onclick={toggleDock}
						class="p-1.5 lg:inline-flex hidden cursor-pointer rounded-lg text-text-muted hover:bg-surface-muted hover:text-text"
						title={chatStore.isDocked
							? 'Switch to floating window'
							: 'Dock side-by-side with lesson'}
						aria-label={chatStore.isDocked ? 'Undock companion' : 'Dock companion'}
					>
						{#if chatStore.isDocked}
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
									d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
								/>
							</svg>
						{:else}
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
									d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
								/>
							</svg>
						{/if}
					</button>

					<!-- Close Button -->
					<button
						type="button"
						class="p-1.5 cursor-pointer rounded-lg text-text-muted hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
						onclick={toggleDrawer}
						aria-label="Close assistant"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4.5 w-4.5"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Active Study Context Banner -->
			{#if activeContextLabel}
				<div
					class="px-3.5 py-1.5 font-semibold flex items-center justify-between border-b border-primary/20 bg-primary-soft/40 text-[11px] text-primary"
				>
					<div class="gap-1.5 flex items-center truncate">
						<span>📍 Context:</span>
						<span class="font-bold truncate text-text">{activeContextLabel}</span>
					</div>
					<button
						type="button"
						onclick={() => (contextDismissed = true)}
						class="text-text-muted hover:text-text"
						title="Clear active context"
						aria-label="Clear active context"
					>
						✕
					</button>
				</div>
			{/if}

			<!-- Quick Action Prompt Chips Strip -->
			<div
				class="gap-1.5 px-3 py-2 flex overflow-x-auto border-b border-border/60 bg-surface-muted/40 text-[11px]"
			>
				{#each promptChips as chip (chip.label)}
					<button
						type="button"
						onclick={() => handleChipClick(chip.prompt)}
						disabled={loading}
						class="px-2.5 py-1 font-semibold inline-flex shrink-0 cursor-pointer items-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-primary/40 hover:text-primary active:scale-95 disabled:opacity-50"
					>
						{chip.label}
					</button>
				{/each}
			</div>

			<!-- Message List Container -->
			<div
				bind:this={messagesContainer}
				class="space-y-3.5 p-3.5 flex-1 overflow-y-auto scroll-smooth"
			>
				<!-- Initial Mode Entry Panel when conversation is fresh -->
				{#if messages.length <= 1}
					<div class="rounded-2xl p-4 border border-border/80 bg-surface-muted/50">
						<div class="mb-3 flex items-center justify-between">
							<span class="font-bold tracking-wider text-[10px] text-text-muted uppercase">
								Choose a learning mode:
							</span>
							<span class="font-semibold text-[10px] text-primary">
								{socraticMode ? '💡 Socratic Mode Active' : '⚡ Direct Mode Active'}
							</span>
						</div>

						<div class="gap-2 sm:grid-cols-2 grid grid-cols-1">
							{#each tutorModes as mode (mode.title)}
								<button
									type="button"
									onclick={() => handleChipClick(mode.prompt)}
									disabled={loading}
									class="p-2.5 hover:shadow-xs flex cursor-pointer flex-col items-start rounded-xl border border-border bg-surface text-left transition-all hover:border-primary/50 hover:bg-primary-soft/20 active:scale-98 disabled:opacity-50"
								>
									<div class="gap-1.5 text-xs font-bold flex items-center text-text">
										<span>{mode.icon}</span>
										<span>{mode.title}</span>
									</div>
									<span class="mt-0.5 line-clamp-2 text-[10px] text-text-muted">
										{mode.desc}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#each messages as msg, idx (idx)}
					<div class="group flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs relative max-w-[88%]
							{msg.role === 'user'
								? 'text-white rounded-br-none bg-primary'
								: 'prose dark:prose-invert rounded-bl-none border border-border bg-surface-muted text-text'}"
						>
							{#if msg.role === 'assistant'}
								<div class="space-y-1.5">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderSanitizedMarkdown(msg.content)}
								</div>

								<!-- Copy Message Button -->
								<button
									type="button"
									onclick={() => handleCopyMessage(msg.content)}
									class="top-2 right-2 rounded p-1 absolute hidden text-[10px] text-text-muted opacity-80 transition-opacity group-hover:inline-flex hover:bg-surface hover:text-text"
									title="Copy response"
								>
									📋
								</button>
							{:else}
								<div>{msg.content}</div>
							{/if}

							{#if msg.sources && msg.sources.length > 0}
								<div class="mt-2.5 pt-2 border-t border-border/40 text-[11px]">
									<div class="mb-1 gap-1.5 font-bold flex items-center">
										{#if msg.sourceSupport === 'strong'}
											<span
												class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400 text-[10px]"
											>
												📘 Strong source support
											</span>
										{:else}
											<span
												class="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400 text-[10px]"
											>
												📘 Limited source support
											</span>
										{/if}
									</div>
									<div class="text-muted-foreground gap-0.5 flex flex-col text-[10px]">
										{#each msg.sources as src, srcIdx (src.chunkId || `${src.sourceTitle}-${srcIdx}`)}
											<div>
												• <strong>{src.sourceTitle}</strong>
												{#if src.pageNumber}
													<span> (Page {src.pageNumber})</span>
												{/if}
												{#if src.chapter}
													<span> ({src.chapter})</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{:else if msg.role === 'assistant' && msg.sourceSupport === 'none' && !msg.isError}
								<div
									class="text-muted-foreground mt-2 gap-1 pt-1 flex items-center border-t border-border/40 text-[10px]"
								>
									<span>🌐 General knowledge explanation</span>
								</div>
							{/if}

							{#if msg.isError}
								<div class="mt-3 gap-2 pt-2 flex flex-wrap items-center border-t border-border/50">
									<a
										href="/app/review"
										class="bg-card text-foreground hover:bg-muted px-2.5 py-1 font-semibold rounded-lg border border-border text-[11px]"
									>
										🧠 Review Flashcards
									</a>
									<a
										href="/app/courses"
										class="bg-card text-foreground hover:bg-muted px-2.5 py-1 font-semibold rounded-lg border border-border text-[11px]"
									>
										📖 Continue Lesson
									</a>
									<button
										type="button"
										onclick={() => handleSend()}
										class="px-2.5 py-1 font-semibold rounded-lg bg-primary/10 text-[11px] text-primary hover:bg-primary/20"
									>
										🔄 Retry Question
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if loading}
					<div class="flex justify-start">
						<div
							class="gap-1 rounded-2xl px-3.5 py-2.5 flex items-center rounded-bl-none border border-border bg-surface-muted"
						>
							<span
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 0ms"
							></span>
							<span
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 150ms"
							></span>
							<span
								class="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 300ms"
							></span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Input form footer -->
			<div class="p-3 border-t border-border bg-surface">
				<div class="gap-2 flex">
					<input
						type="text"
						bind:value={inputMessage}
						onkeydown={handleKeyDown}
						placeholder={activeContextLabel
							? `Ask about "${activeContextLabel}"...`
							: 'Ask a study question...'}
						aria-label="Ask a question"
						class="px-3.5 py-2.5 text-xs grow rounded-xl border border-border bg-surface-muted transition-colors duration-180 hover:border-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						disabled={loading}
					/>
					<button
						type="button"
						class="px-4 py-2.5 text-white shadow-xs flex cursor-pointer items-center justify-center rounded-xl bg-primary transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
						onclick={handleSend}
						disabled={loading || !inputMessage.trim()}
						aria-label="Send message"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-4 w-4"
						>
							<line x1="22" y1="2" x2="11" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
					</button>
				</div>
			</div>
		</aside>
	{/if}
{/if}

<style>
	.animate-slide-in {
		animation: slideIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}
</style>
