<script lang="ts">
	// HeroPanel.svelte — Left-side hero presentation panel for landing/auth page
</script>

<div
	class="from-indigo-900 via-indigo-800 to-purple-950 p-8 text-white md:flex md:w-1/2 lg:p-12 relative hidden flex-col justify-between overflow-y-auto bg-linear-to-br select-none"
>
	<!-- Ambient lighting -->
	<div
		class="inset-0 absolute bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.25),transparent_50%)]"
	></div>
	<div class="-bottom-32 -left-32 h-96 w-96 bg-indigo-500/20 blur-3xl absolute rounded-full"></div>
	<div class="-right-24 h-72 w-72 bg-purple-500/15 blur-3xl absolute top-1/3 rounded-full"></div>

	<!-- Top Header -->
	<div class="z-10 flex items-center justify-between">
		<div class="gap-3 flex items-center">
			<div
				class="h-11 w-11 bg-white text-indigo-700 shadow-xl shadow-indigo-950/40 flex items-center justify-center rounded-xl"
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
				<span class="font-medium tracking-wide text-indigo-200/80 block text-[11px]"
					>Intelligent Learning Platform</span
				>
			</div>
		</div>
	</div>

	<!-- Center Callout -->
	<div class="py-4 lg:py-8 z-10 my-auto">
		<div
			class="mb-6 gap-2 border-indigo-300/20 bg-indigo-500/15 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 backdrop-blur-md inline-flex items-center rounded-full border"
		>
			<span class="h-2 w-2 relative flex">
				<span
					class="animate-ping bg-emerald-400 absolute inline-flex h-full w-full rounded-full opacity-75"
				></span>
				<span class="h-2 w-2 bg-emerald-500 relative inline-flex rounded-full"></span>
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
			class="rounded-2xl border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-xl hover:border-white/25 border transition-all duration-300"
		>
			<div class="mb-4 border-white/10 pb-3 flex items-center justify-between border-b">
				<div class="gap-2.5 flex items-center">
					<div
						class="h-8 w-8 bg-indigo-500/30 text-xs font-semibold text-indigo-200 flex items-center justify-center rounded-lg"
					>
						ML
					</div>
					<div>
						<h4 class="text-xs font-bold text-white">Neural Networks & Deep Learning</h4>
						<p class="text-indigo-200/70 text-[11px]">Module 2 of 4 &bull; In Progress</p>
					</div>
				</div>
				<div
					class="gap-1.5 border-amber-400/30 bg-amber-500/20 px-2.5 py-1 font-bold text-amber-300 flex items-center rounded-full border text-[11px]"
				>
					<span>🔥 7 Day Streak</span>
				</div>
			</div>

			<div class="mb-3">
				<div class="mb-1 font-semibold flex justify-between text-[11px]">
					<span class="text-indigo-200/80">Course Completion</span>
					<span class="text-emerald-400">65%</span>
				</div>
				<div class="h-2 bg-black/20 w-full overflow-hidden rounded-full">
					<div
						class="from-indigo-400 to-emerald-400 h-full w-[65%] rounded-full bg-linear-to-r"
					></div>
				</div>
			</div>

			<div class="space-y-2 text-xs">
				<div class="bg-white/5 p-2.5 text-white/90 flex items-center justify-between rounded-lg">
					<div class="gap-2 flex items-center">
						<span
							class="h-4 w-4 bg-emerald-500/30 font-bold text-emerald-300 flex items-center justify-center rounded-full text-[10px]"
							>✓</span
						>
						<span class="text-xs font-medium">01. Perceptrons & Activation Functions</span>
					</div>
					<span class="font-semibold text-emerald-400 text-[10px]">Passed</span>
				</div>
				<div
					class="border-indigo-400/30 bg-indigo-500/20 p-2.5 text-white flex items-center justify-between rounded-lg border"
				>
					<div class="gap-2 flex items-center">
						<span
							class="h-4 w-4 bg-indigo-400 font-bold text-indigo-950 flex items-center justify-center rounded-full text-[10px]"
							>►</span
						>
						<span class="text-xs font-semibold">02. Backpropagation & Gradient Descent</span>
					</div>
					<span class="rounded bg-indigo-500/40 px-2 py-0.5 font-bold text-indigo-200 text-[10px]"
						>Quiz Ready</span
					>
				</div>
			</div>
		</div>
	</div>

	<!-- Footer Feature Grid -->
	<div class="border-white/15 pt-6 z-10 border-t">
		<div class="gap-4 grid grid-cols-3">
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">&lt; 5s</div>
				<div class="font-semibold tracking-wider text-indigo-200/70 text-[10px] uppercase">
					Course Creation
				</div>
			</div>
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">AI Tutor</div>
				<div class="font-semibold tracking-wider text-indigo-200/70 text-[10px] uppercase">
					24/7 Explanations
				</div>
			</div>
			<div class="flex flex-col">
				<div class="font-display text-lg font-bold text-white">100%</div>
				<div class="font-semibold tracking-wider text-indigo-200/70 text-[10px] uppercase">
					Personalized
				</div>
			</div>
		</div>
		<div class="mt-6 text-indigo-200/50 flex justify-between text-[11px]">
			<span>AI Study Buddy &bull; Smart Learning Companion</span>
			<span>Protected & Secure</span>
		</div>
	</div>
</div>
