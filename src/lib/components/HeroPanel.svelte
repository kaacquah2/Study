<script lang="ts">
	// HeroPanel.svelte — Left-side hero presentation panel for landing/auth page
</script>

<div
	class="relative hidden flex-col justify-between overflow-hidden text-white select-none md:flex md:w-1/2"
	style="background: linear-gradient(155deg, #1a1240 0%, #2a1f5c 35%, #1e1648 60%, #0d0d20 100%);"
>
	<!-- Dot-grid noise overlay -->
	<div
		class="absolute inset-0 opacity-[0.07]"
		style="background-image: radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px); background-size: 24px 24px;"
	></div>

	<!-- Luminance orbs — asymmetric placement -->
	<div
		class="absolute -top-32 -right-32 h-120 w-120 rounded-full opacity-40"
		style="background: radial-gradient(circle at center, #7c5cf6 0%, transparent 65%); filter: blur(60px);"
	></div>
	<div
		class="absolute bottom-0 -left-24 h-72 w-72 rounded-full opacity-25"
		style="background: radial-gradient(circle at center, #4f46e5 0%, transparent 70%); filter: blur(50px);"
	></div>
	<div
		class="absolute top-1/2 right-1/3 h-48 w-48 rounded-full opacity-15"
		style="background: radial-gradient(circle at center, #a78bfa 0%, transparent 70%); filter: blur(40px);"
	></div>

	<!-- Animated drifting particles (CSS only) -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
		<div class="hero-particle" style="--x: 18%; --y: 22%; --dur: 12s; --delay: 0s;"></div>
		<div class="hero-particle" style="--x: 72%; --y: 65%; --dur: 18s; --delay: -4s;"></div>
		<div class="hero-particle" style="--x: 45%; --y: 80%; --dur: 14s; --delay: -8s;"></div>
		<div class="hero-particle" style="--x: 85%; --y: 35%; --dur: 20s; --delay: -2s;"></div>
	</div>

	<!-- Content wrapper -->
	<div class="relative z-10 flex h-full flex-col justify-between p-8 lg:p-12">
		<!-- Top: Logo + Brand -->
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
				style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(8px);"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5 text-white"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
					<path d="M6 10h10" />
					<path d="M6 14h6" />
				</svg>
			</div>
			<div>
				<span class="block text-[15px] leading-tight font-bold tracking-tight text-white"
					>AI Study Buddy</span
				>
				<span class="block text-[11px] font-medium tracking-wide text-white/50"
					>Intelligent Learning Platform</span
				>
			</div>
		</div>

		<!-- Center: Hero copy + mockup -->
		<div class="my-auto py-6 lg:py-10">
			<!-- Status pill -->
			<div
				class="mb-7 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide"
				style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(10px); color: rgba(255,255,255,0.75);"
			>
				<span class="relative flex h-2 w-2">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
						style="background: #4ade80;"
					></span>
					<span class="relative inline-flex h-2 w-2 rounded-full" style="background: #22c55e;"
					></span>
				</span>
				AI Course Generator &amp; Active Recall Engine
			</div>

			<h1 class="mb-4 text-3xl leading-[1.15] font-bold tracking-tight text-white lg:text-[2.4rem]">
				Learn anything<br />effortlessly.
			</h1>
			<p
				class="mb-8 text-sm leading-relaxed lg:text-[0.925rem]"
				style="color: rgba(255,255,255,0.58);"
			>
				Enter any subject to generate tailored courses, step-by-step lessons, interactive quizzes,
				and AI tutor assistance on demand.
			</p>

			<!-- Product UI Mockup — true glassmorphic surface -->
			<div
				class="rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
				style="background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.13); border-top-color: rgba(255,255,255,0.22); backdrop-filter: blur(20px); box-shadow: 0 20px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1);"
			>
				<!-- Course header -->
				<div
					class="mb-4 flex items-center justify-between pb-3"
					style="border-bottom: 1px solid rgba(255,255,255,0.08);"
				>
					<div class="flex items-center gap-2.5">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
							style="background: rgba(139,117,245,0.25); color: rgba(196,185,255,0.9);"
						>
							ML
						</div>
						<div>
							<h4 class="text-[12px] leading-tight font-semibold text-white">
								Neural Networks &amp; Deep Learning
							</h4>
							<p class="mt-0.5 text-[10px]" style="color: rgba(255,255,255,0.4);">
								Module 2 of 4 &bull; In Progress
							</p>
						</div>
					</div>
					<div
						class="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
						style="background: rgba(245,166,36,0.15); border: 1px solid rgba(245,166,36,0.25); color: #f5c36a;"
					>
						🔥 7 Day Streak
					</div>
				</div>

				<!-- Progress bar -->
				<div class="mb-3.5">
					<div class="mb-1.5 flex items-center justify-between text-[10px] font-medium">
						<span style="color: rgba(255,255,255,0.5);">Course Completion</span>
						<span style="color: #5eead4;">65%</span>
					</div>
					<div
						class="h-1.5 w-full overflow-hidden rounded-full"
						style="background: rgba(0,0,0,0.3);"
					>
						<div
							class="h-full w-[65%] rounded-full"
							style="background: linear-gradient(90deg, #818cf8 0%, #34d399 100%);"
						></div>
					</div>
				</div>

				<!-- Lessons list -->
				<div class="space-y-1.5 text-[11px]">
					<div
						class="flex items-center justify-between rounded-lg px-3 py-2"
						style="background: rgba(255,255,255,0.04);"
					>
						<div class="flex items-center gap-2">
							<span
								class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
								style="background: rgba(52,211,153,0.2); color: #34d399;">✓</span
							>
							<span class="font-medium" style="color: rgba(255,255,255,0.75);"
								>01. Perceptrons &amp; Activation Functions</span
							>
						</div>
						<span class="text-[9px] font-semibold" style="color: #34d399;">Passed</span>
					</div>
					<div
						class="flex items-center justify-between rounded-lg px-3 py-2"
						style="background: rgba(139,117,245,0.14); border: 1px solid rgba(139,117,245,0.22);"
					>
						<div class="flex items-center gap-2">
							<span
								class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
								style="background: rgba(139,117,245,0.4); color: #c4b5fd;">▶</span
							>
							<span class="font-semibold text-white"
								>02. Backpropagation &amp; Gradient Descent</span
							>
						</div>
						<span
							class="rounded px-2 py-0.5 text-[9px] font-bold"
							style="background: rgba(139,117,245,0.3); color: #c4b5fd;">Quiz Ready</span
						>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom: Stats strip -->
		<div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 1.5rem;">
			<div class="mb-4 grid grid-cols-3 gap-4">
				<div class="flex flex-col">
					<span class="text-lg font-bold tracking-tight text-white">&lt; 5s</span>
					<span
						class="mt-0.5 text-[9px] font-semibold tracking-widest uppercase"
						style="color: rgba(255,255,255,0.38);">Course Creation</span
					>
				</div>
				<div class="flex flex-col">
					<span class="text-lg font-bold tracking-tight text-white">AI Tutor</span>
					<span
						class="mt-0.5 text-[9px] font-semibold tracking-widest uppercase"
						style="color: rgba(255,255,255,0.38);">24/7 Explanations</span
					>
				</div>
				<div class="flex flex-col">
					<span class="text-lg font-bold tracking-tight text-white">100%</span>
					<span
						class="mt-0.5 text-[9px] font-semibold tracking-widest uppercase"
						style="color: rgba(255,255,255,0.38);">Personalized</span
					>
				</div>
			</div>
			<div class="flex justify-between text-[10px]" style="color: rgba(255,255,255,0.28);">
				<span>AI Study Buddy &bull; Smart Learning Companion</span>
				<span>Protected &amp; Secure</span>
			</div>
		</div>
	</div>
</div>

<style>
	/* Drifting ambient particles */
	.hero-particle {
		position: absolute;
		left: var(--x);
		top: var(--y);
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: rgba(167, 139, 250, 0.6);
		animation: particle-drift var(--dur) ease-in-out infinite var(--delay);
	}

	@keyframes particle-drift {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
			opacity: 0.6;
		}
		33% {
			transform: translate(12px, -18px) scale(1.4);
			opacity: 0.9;
		}
		66% {
			transform: translate(-8px, 10px) scale(0.8);
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-particle {
			animation: none;
		}
	}
</style>
