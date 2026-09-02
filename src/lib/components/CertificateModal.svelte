<script lang="ts">
	interface Props {
		isOpen: boolean;
		userName: string;
		courseTitle: string;
		completedDate?: string;
		onClose: () => void;
	}

	let {
		isOpen,
		userName,
		courseTitle,
		completedDate = new Date().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}),
		onClose
	}: Props = $props();

	function handlePrint() {
		window.print();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && isOpen) {
			onClose();
		}
	}}
/>

{#if isOpen}
	<div class="inset-0 bg-black/60 p-4 backdrop-blur-md fixed z-50 flex items-center justify-center">
		<div
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="certificate-modal-title"
			class="max-w-2xl rounded-2xl border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 w-full border"
		>
			<!-- Printable Certificate Container -->
			<div
				id="certificate-print-area"
				class="border-amber-500/40 from-amber-50/50 via-white to-amber-50/30 p-8 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 relative overflow-hidden rounded-xl border-8 border-double bg-linear-to-b text-center"
			>
				<!-- Decorative Ribbon Icon -->
				<div
					class="mb-4 h-16 w-16 bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center rounded-full"
					aria-hidden="true"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-10 w-10"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-6.75a1.125 1.125 0 01-1.125-1.125V18.75m9 0h-9m.75-12h7.5m-7.5 0a3 3 0 013-3h1.5a3 3 0 013 3m-7.5 0v3.75m7.5-3.75v3.75"
						/>
					</svg>
				</div>

				<p
					class="text-xs font-semibold tracking-widest text-amber-600 dark:text-amber-400 uppercase"
				>
					Official Certificate of Completion
				</p>

				<h2
					id="certificate-modal-title"
					class="mt-2 mb-4 font-serif text-3xl font-bold text-slate-900 dark:text-white"
				>
					Certificate of Achievement
				</h2>

				<p class="text-xs text-slate-500 dark:text-slate-400">This certifies that</p>

				<p
					class="my-2 text-2xl font-semibold text-slate-900 decoration-amber-400/50 dark:text-amber-300 underline decoration-2 underline-offset-4"
				>
					{userName || 'Learner'}
				</p>

				<p class="text-xs text-slate-500 dark:text-slate-400">
					has successfully mastered and completed the comprehensive AI course:
				</p>

				<p
					class="my-3 bg-amber-500/10 px-4 py-1 text-lg font-bold text-slate-800 dark:text-slate-100 inline-block rounded-lg"
				>
					{courseTitle}
				</p>

				<div
					class="mt-6 border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 flex items-end justify-between border-t"
				>
					<div class="text-left">
						<p class="font-medium text-slate-700 dark:text-slate-300">Date Issued</p>
						<p>{completedDate}</p>
					</div>

					<div class="text-right">
						<p class="font-medium text-slate-700 dark:text-slate-300">Verification ID</p>
						<p class="font-mono text-[10px]">
							VERIFIED-{Math.random().toString(36).substring(2, 9).toUpperCase()}
						</p>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="mt-6 gap-3 flex justify-end">
				<button
					type="button"
					onclick={onClose}
					aria-label="Close certificate modal"
					class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer rounded-lg"
				>
					Close
				</button>
				<button
					type="button"
					onclick={handlePrint}
					aria-label="Download or print certificate"
					class="gap-1.5 bg-amber-500 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-600 flex cursor-pointer items-center rounded-lg shadow-md"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231a1.125 1.125 0 01-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-14.326 0C3.768 7.441 3 8.375 3 9.456v6.294A2.25 2.25 0 005.25 18h1.091"
						/>
					</svg>
					Download / Print Certificate
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@media print {
		:global(body *) {
			visibility: hidden;
		}
		#certificate-print-area,
		#certificate-print-area * {
			visibility: visible;
		}
		#certificate-print-area {
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			border: 4px solid #f59e0b;
		}
	}
</style>
