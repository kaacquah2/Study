<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { auth } from '$lib/firebase/client';
	import { page } from '$app/state';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { renderSanitizedMarkdown } from '$lib/utils/markdown';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { studySessionStore } from '$lib/stores/studySession.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Message {
		role: 'user' | 'assistant';
		content: string;
		sources?: Array<{ moduleId: string; pageTitle: string }>;
	}

	// State using Svelte 5 runes
	let messages = $state<Message[]>([
		{
			role: 'assistant',
			content:
				'Hi! I am your AI Study Buddy. Ask me anything about your current lesson, concepts, or quiz!'
		}
	]);
	let inputMessage = $state('');
	let loading = $state(false);
	let socraticMode = $state(true);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	// Resizing state
	let isResizing = $state(false);

	// Derive route params
	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.moduleId || page.params.mid);

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

	// Quick-Action Prompt Chips
	const promptChips = [
		{ label: '💡 Analogy', prompt: 'Can you explain this concept using a simple real-world analogy?' },
		{ label: '🧪 Practical Example', prompt: 'Can you give me a concrete, practical code or real-world example?' },
		{ label: '❓ Quiz Me', prompt: 'Can you give me a quick 1-question check to test my understanding of this section?' },
		{ label: '📝 Key Takeaways', prompt: 'What are the 3 most important key takeaways from this topic?' }
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
								} else if (payload.type === 'done' && payload.sources) {
									messages = messages.map((m, idx) =>
										idx === assistantMessageIndex ? { ...m, sources: payload.sources } : m
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
					content: connectionMsg
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
			class="fixed right-6 bottom-20 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-xl transition-all duration-180 hover:scale-105 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 md:right-6 md:bottom-6"
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
				class="fixed inset-0 z-40 bg-text/20 backdrop-blur-xs md:hidden"
				onclick={toggleDrawer}
			></div>
		{/if}

		<aside
			class="animate-slide-in flex flex-col border-l border-border bg-surface shadow-2xl transition-all duration-150 {chatStore.isDocked
				? 'relative z-20 h-screen shrink-0 border-l border-border bg-surface'
				: 'fixed top-0 right-0 z-50 h-full w-full max-w-[calc(100vw-2rem)] md:w-96 lg:w-105'}"
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
					class="group absolute top-0 bottom-0 -left-1.5 z-30 w-3 cursor-col-resize select-none focus:outline-none"
					title="Drag to resize AI Companion width"
				>
					<div
						class="mx-auto h-full w-1 rounded-full transition-colors group-hover:bg-primary {isResizing
							? 'bg-primary'
							: 'bg-transparent'}"
					></div>
				</div>
			{/if}

			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border p-4">
				<div class="flex items-center gap-2">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary shadow-xs"
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
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
							<path d="M8 10h.01" stroke-width="3" />
							<path d="M16 10h.01" stroke-width="3" />
							<path d="M9 14h6" />
						</svg>
					</div>
					<div>
						<h3 class="font-display text-xs font-bold text-text">AI Study Assistant</h3>
						<div class="flex items-center gap-2">
							<span class="text-[10px] font-bold tracking-wider text-success uppercase"
								>● Online</span
							>
							<button
								type="button"
								onclick={() => (socraticMode = !socraticMode)}
								class="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all {socraticMode
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

				<div class="flex items-center gap-1">
					<!-- Dock Mode Toggle (Hidden on mobile/tablet < 1024px) -->
					<button
						type="button"
						onclick={toggleDock}
						class="hidden cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text lg:inline-flex"
						title={chatStore.isDocked ? 'Switch to floating window' : 'Dock side-by-side with lesson'}
						aria-label={chatStore.isDocked ? 'Undock companion' : 'Dock companion'}
					>
						{#if chatStore.isDocked}
							<!-- Undock / Float icon -->
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
							<!-- Dock icon -->
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
						class="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
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

			<!-- Quick Action Prompt Chips Strip -->
			<div
				class="flex gap-1.5 overflow-x-auto border-b border-border/60 bg-surface-muted/40 px-3 py-2 text-[11px]"
			>
				{#each promptChips as chip (chip.label)}
					<button
						type="button"
						onclick={() => handleChipClick(chip.prompt)}
						disabled={loading}
						class="inline-flex shrink-0 cursor-pointer items-center rounded-lg border border-border bg-surface px-2.5 py-1 font-semibold text-text-muted transition-colors hover:border-primary/40 hover:text-primary active:scale-95 disabled:opacity-50"
					>
						{chip.label}
					</button>
				{/each}
			</div>

			<!-- Message List Container -->
			<div
				bind:this={messagesContainer}
				class="flex-1 space-y-3.5 overflow-y-auto scroll-smooth p-3.5"
			>
				{#each messages as msg, idx (idx)}
					<div class="group flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="relative max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs
							{msg.role === 'user'
								? 'rounded-br-none bg-primary text-white'
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
									class="absolute top-2 right-2 hidden rounded p-1 text-[10px] text-text-muted opacity-80 transition-opacity group-hover:inline-flex hover:bg-surface hover:text-text"
									title="Copy response"
								>
									📋
								</button>
							{:else}
								<div>{msg.content}</div>
							{/if}

							{#if msg.sources && msg.sources.length > 0}
								<div
									class="mt-2 border-t border-border/40 pt-1 text-[10px] font-semibold opacity-85"
								>
									<span class="font-bold">Sources:</span>
									{msg.sources.map((s) => s.pageTitle).join(', ')}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if loading}
					<div class="flex justify-start">
						<div
							class="flex items-center gap-1 rounded-2xl rounded-bl-none border border-border bg-surface-muted px-3.5 py-2.5"
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
			<div class="border-t border-border bg-surface p-3">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={inputMessage}
						onkeydown={handleKeyDown}
						placeholder="Ask about this lesson..."
						aria-label="Ask a question"
						class="grow rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-xs transition-colors duration-180 hover:border-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						disabled={loading}
					/>
					<button
						type="button"
						class="flex cursor-pointer items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-white shadow-xs transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
