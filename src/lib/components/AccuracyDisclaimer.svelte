<script lang="ts">
	interface Props {
		goal?: string | null;
		compact?: boolean;
	}

	let { goal = null, compact = false }: Props = $props();

	const isExamPrep = $derived(
		goal?.toLowerCase().includes('exam') || goal?.toLowerCase().includes('test')
	);
</script>

{#if compact}
	<div
		class="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
				clip-rule="evenodd"
			/>
		</svg>
		<span>AI-generated — verify critical facts</span>
	</div>
{:else}
	<div
		class="my-4 flex w-full items-start gap-3 rounded-r-lg border-l-4 border-amber-500 bg-linear-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3 text-sm text-slate-700 dark:text-slate-300"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
				clip-rule="evenodd"
			/>
		</svg>
		<div>
			<p class="font-medium text-slate-900 dark:text-slate-100">
				{#if isExamPrep}
					🎯 Exam Prep Notice: Verify High-Stakes Information
				{:else}
					AI-Generated Content Disclaimer
				{/if}
			</p>
			<p class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
				This lesson was created by AI model synthesis. While optimized for accuracy, please
				cross-reference key technical facts, formulas, or dates with official textbooks prior to
				exams.
			</p>
		</div>
	</div>
{/if}
