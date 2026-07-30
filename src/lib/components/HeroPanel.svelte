<script lang="ts">
	// HeroPanel.svelte — Left-side hero presentation panel for landing/auth page
</script>

<div
	class="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-indigo-900 via-indigo-800 to-purple-950 p-12 text-white select-none md:flex md:w-1/2 lg:p-16"
>
	<!-- Ambient lighting -->
	<div
		class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.25),transparent_50%)]"
	></div>
	<div class="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl"></div>
	<div class="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl"></div>

	<!-- Top Header -->
	<div class="z-10 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div
				class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-xl shadow-indigo-950/40"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-6 w-6"
				>
					<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
					<path d="M6 6h10" />
					<path d="M6 10h10" />
					<path d="M6 14h6" />
				</svg>
			</div>
			<div>
				<span class="font-display text-xl font-bold tracking-tight text-white">AI Study Buddy</span>
				<span class="block text-[11px] font-medium tracking-wide text-indigo-200/80"
					>Intelligent Learning Platform</span
				>
			</div>
		</div>
	</div>

	<!-- Center Callout -->
	<div class="z-10 my-auto py-8">
		<div
			class="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-500/15 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 backdrop-blur-md"
		>
			<span class="relative flex h-2 w-2">
				<span
					class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
				></span>
				<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
			</span>
			AI Course Generator & Active Recall Engine
		</div>

		<h1 class="mb-4 font-display text-3xl leading-tight font-bold lg:text-4xl">
			Learn anything effortlessly.<br />One streak at a time.
		</h1>
		<p class="mb-8 font-sans text-sm leading-relaxed text-indigo-100/85 lg:text-base">
			Enter any subject to generate tailored courses, step-by-step lessons, interactive quizzes, and
			AI tutor assistance on demand.
		</p>

		<!-- Live Product UI Mockup -->
		<div
			class="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-white/25"
		>
			<div class="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
				<div class="flex items-center gap-2.5">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/30 text-xs font-semibold text-indigo-200"
					>
						ML
					</div>
					<div>
						<h4 class="text-xs font-bold text-white">Neural Networks & Deep Learning</h4>
						<p class="text-[11px] text-indigo-200/70">Module 2 of 4 &bull; In Progress</p>
					</div>
				</div>
				<div
					class="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300"
				>
					<span>🔥 7 Day Streak</span>
				</div>
			</div>

			<div class="mb-3">
				<div class="mb-1 flex justify-between text-[11px] font-semibold">
					<span class="text-indigo-200/80">Course Completion</span>
					<span class="text-emerald-400">65%</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-black/20">
					<div
						class="h-full w-[65%] rounded-full bg-linear-to-r from-indigo-400 to-emerald-400"
					></div>
				</div>
			</div>

			<div class="space-y-2 text-xs">
				<div class="flex items-center justify-between rounded-lg bg-white/5 p-2.5 text-white/90">
					<div class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/30 text-[10px] font-bold text-emerald-300"
							>✓</span
						>
						<span class="text-xs font-medium">01. Perceptrons & Activation Functions</span>
					</div>
					<span class="text-[10px] font-semibold text-emerald-400">Passed</span>
				</div>
				<div
					class="flex items-center justify-between rounded-lg border border-indigo-400/30 bg-indigo-500/20 p-2.5 text-white"
				>
					<div class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-400 text-[10px] font-bold text-indigo-950"
							>►</span
						>
						<span class="text-xs font-semibold">02. Backpropagation & Gradient Descent</span>
					</div>
					<span class="rounded bg-indigo-500/40 px-2 py-0.5 text-[10px] font-bold text-indigo-200"
						>Quiz Ready</span
					>
				</div>
			</div>
		</div>
	</div>

	<!-- Footer Feature Grid -->
	<div class="z-10 border-t border-white/15 pt-6">
		<div class="grid grid-cols-3 gap-4">
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">&lt; 5s</div>
				<div class="text-[10px] font-semibold tracking-wider text-indigo-200/70 uppercase">
					Course Creation
				</div>
			</div>
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">AI Tutor</div>
				<div class="text-[10px] font-semibold tracking-wider text-indigo-200/70 uppercase">
					24/7 Explanations
				</div>
			</div>
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">100%</div>
				<div class="text-[10px] font-semibold tracking-wider text-indigo-200/70 uppercase">
					Personalized
				</div>
			</div>
		</div>
		<div class="mt-6 flex justify-between text-[11px] text-indigo-200/50">
			<span>AI Study Buddy &bull; Smart Learning Companion</span>
			<span>Protected & Secure</span>
		</div>
	</div>
</div>
