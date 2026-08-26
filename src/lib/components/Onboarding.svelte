<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebase/client';
	import { Upload, BookOpen, Compass, Bot, Sparkles, X, ArrowRight } from '@lucide/svelte';

	interface Props {
		onClose?: () => void;
	}

	let { onClose }: Props = $props();
	let isDismissing = $state(false);

	const completeOnboarding = async (targetRoute?: string) => {
		isDismissing = true;
		try {
			const idToken = await auth.currentUser?.getIdToken();
			if (idToken) {
				await fetch('/api/user', {
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${idToken}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ onboardingComplete: true })
				});
			}
		} catch (e) {
			console.debug('Failed to record onboarding completion:', e);
		}

		if (targetRoute) {
			goto(targetRoute);
		}
		onClose?.();
	};

	const starterActions = [
		{
			title: 'Upload Study Material',
			desc: 'Upload PDFs or notes to generate grounded courses and accurate RAG search.',
			icon: Upload,
			badge: 'Recommended',
			badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
			route: '/app/knowledge',
			color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 hover:border-emerald-500/50'
		},
		{
			title: 'Create an AI Course',
			desc: 'Generate a structured multi-module curriculum from any topic or prompt.',
			icon: BookOpen,
			badge: 'Instant',
			badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
			route: '/app/courses/createCourse',
			color: 'from-blue-500/10 to-indigo-500/10 border-blue-500/20 hover:border-blue-500/50'
		},
		{
			title: 'Explore Knowledge Map',
			desc: 'Visualize topic hierarchies, track concept mastery, and pinpoint gaps.',
			icon: Compass,
			badge: 'Adaptive',
			badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
			route: '/app/knowledge-map',
			color: 'from-purple-500/10 to-pink-500/10 border-purple-500/20 hover:border-purple-500/50'
		},
		{
			title: 'Try AI Study Tutor',
			desc: 'Ask complex questions, summarize dense materials, or practice concepts.',
			icon: Bot,
			badge: 'Interactive',
			badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
			route: '/app/courses',
			color: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 hover:border-amber-500/50'
		}
	];
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all duration-300"
	role="dialog"
	aria-modal="true"
	aria-labelledby="onboarding-title"
>
	<div
		class="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8"
	>
		<!-- Header with Sparkles -->
		<div class="mb-6 flex items-start justify-between">
			<div class="flex items-center gap-3">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner"
				>
					<Sparkles class="h-6 w-6 animate-pulse" />
				</div>
				<div>
					<h2 id="onboarding-title" class="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
						Welcome to Study AI 👋
					</h2>
					<p class="text-sm text-muted-foreground">
						Your adaptive AI-powered learning system. How would you like to start?
					</p>
				</div>
			</div>
			<button
				onclick={() => completeOnboarding()}
				disabled={isDismissing}
				class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
				aria-label="Close modal"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Action Cards Grid -->
		<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
			{#each starterActions as action (action.title)}
				{@const Icon = action.icon}
				<button
					onclick={() => completeOnboarding(action.route)}
					disabled={isDismissing}
					class="group relative flex flex-col items-start gap-2.5 rounded-xl border bg-linear-to-br p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-60 {action.color}"
				>
					<div class="flex w-full items-center justify-between">
						<div class="rounded-lg bg-card/80 p-2 text-foreground shadow-sm">
							<Icon class="h-5 w-5 transition-transform group-hover:scale-110" />
						</div>
						<span
							class="rounded-full border px-2 py-0.5 text-[11px] font-medium {action.badgeClass}"
						>
							{action.badge}
						</span>
					</div>
					<div>
						<h3 class="text-sm font-semibold text-foreground group-hover:text-primary">
							{action.title}
						</h3>
						<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
							{action.desc}
						</p>
					</div>
					<div
						class="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"
					>
						Get started <ArrowRight class="h-3.5 w-3.5" />
					</div>
				</button>
			{/each}
		</div>

		<!-- Footer -->
		<div class="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
			<span>You can access all tools anytime from the sidebar.</span>
			<button
				onclick={() => completeOnboarding()}
				disabled={isDismissing}
				class="font-medium text-foreground hover:underline disabled:opacity-50"
			>
				Skip for now →
			</button>
		</div>
	</div>
</div>
