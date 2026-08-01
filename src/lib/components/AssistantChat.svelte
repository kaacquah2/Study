<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { auth } from '$lib/firebase/client';
	import { page } from '$app/state';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { renderSanitizedMarkdown } from '$lib/utils/markdown';
	interface Message {
		role: 'user' | 'assistant';
		content: string;
		sources?: Array<{ moduleId: string; pageTitle: string }>;
	}

	// State using Svelte 5 runes
	let isOpen = $state(false);
	let messages = $state<Message[]>([
		{
			role: 'assistant',
			content:
				'Hi! I am your AI Study Buddy. Ask me anything about your current course, lesson, or quiz!'
		}
	]);
	let inputMessage = $state('');
	let loading = $state(false);
	let socraticMode = $state(true);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	// Derive route params
	const courseId = $derived(page.params.id);
	const moduleId = $derived(page.params.moduleId || page.params.mid);

	// Toggle drawer
	const toggleDrawer = () => {
		isOpen = !isOpen;
		if (isOpen) {
			scrollToBottom();
		}
	};

	// Auto-scroll to bottom of messages
	const scrollToBottom = () => {
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 60);
	};

	// Send message
	const handleSend = async () => {
		const text = inputMessage.trim();
		if (!text || loading) return;

		inputMessage = '';
		messages = [...messages, { role: 'user', content: text }];
		loading = true;
		scrollToBottom();

		try {
			const idToken = await auth.currentUser?.getIdToken();

			// Add initial empty assistant message to receive stream
			messages = [...messages, { role: 'assistant', content: '' }];
			const assistantMessageIndex = messages.length - 1;

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
					socraticMode
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
	<!-- Floating trigger button (Only visible when drawer is closed) -->
	{#if !isOpen}
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

	<!-- Chat Drawer overlay -->
	{#if isOpen}
		<!-- Backdrop for mobile screen dimming -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-40 bg-text/20 backdrop-blur-xs md:hidden"
			onclick={toggleDrawer}
		></div>

		<div
			class="animate-slide-in fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl md:w-105"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border p-4.5">
				<div class="flex items-center gap-2">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"
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
						<h3 class="font-display text-sm font-bold text-text">AI Study Assistant</h3>
						<div class="mt-0.5 flex items-center gap-2">
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

				<button
					type="button"
					class="cursor-pointer rounded-full p-3 text-text-muted transition-all hover:bg-surface-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
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
						class="h-5 w-5"
						><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
					>
				</button>
			</div>

			<!-- Message List Container -->
			<div bind:this={messagesContainer} class="flex-1 space-y-4 overflow-y-auto scroll-smooth p-4">
				{#each messages as msg, idx (idx)}
					<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs
                     {msg.role === 'user'
								? 'rounded-br-none bg-primary text-white'
								: 'prose dark:prose-invert rounded-bl-none border border-border bg-surface-muted text-text'}"
						>
							{#if msg.role === 'assistant'}
								<div class="space-y-2">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderSanitizedMarkdown(msg.content)}
								</div>
							{:else}
								<div>{msg.content}</div>
							{/if}
							{#if msg.sources && msg.sources.length > 0}
								<div
									class="mt-2 border-t border-border/40 pt-1.5 text-[11px] font-semibold opacity-90"
								>
									<span class="font-bold">Based on:</span>
									{msg.sources.map((s) => s.pageTitle).join(', ')}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if loading}
					<div class="flex justify-start">
						<div
							class="flex items-center gap-1 rounded-2xl rounded-bl-none border border-border bg-surface-muted px-4 py-3"
						>
							<span
								class="h-2 w-2 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 0ms"
							></span>
							<span
								class="h-2 w-2 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 150ms"
							></span>
							<span
								class="h-2 w-2 animate-bounce rounded-full bg-text-muted"
								style="animation-delay: 300ms"
							></span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Input form footer -->
			<div class="border-t border-border bg-surface p-4">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={inputMessage}
						onkeydown={handleKeyDown}
						placeholder="Ask a question..."
						aria-label="Ask a question"
						class="grow rounded-xl border border-border bg-surface-muted px-4.5 py-3 text-sm transition-colors duration-180 hover:border-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						disabled={loading}
					/>
					<button
						type="button"
						class="flex cursor-pointer items-center justify-center rounded-xl bg-primary px-5 py-3 text-white shadow-sm transition-all duration-180 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
							class="h-4.5 w-4.5"
							><line x1="22" y1="2" x2="11" y2="13" /><polygon
								points="22 2 15 22 11 13 2 9 22 2"
							/></svg
						>
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.animate-slide-in {
		animation: slideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
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
