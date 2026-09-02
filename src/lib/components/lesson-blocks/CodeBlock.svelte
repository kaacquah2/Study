<script lang="ts">
	interface Props {
		language: string;
		code: string;
		runnable?: boolean;
	}

	let { language, code, runnable = false }: Props = $props();

	let copied = $state(false);
	let isRunning = $state(false);
	let output = $state('');
	let showOutput = $state(false);
	let outputError = $state(false);

	const handleCopy = async () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	};

	const handleRun = async () => {
		if (isRunning) return;
		isRunning = true;
		output = '';
		outputError = false;
		showOutput = true;

		try {
			// Use a sandboxed approach: only works for simple JS/Python
			if (language === 'javascript' || language === 'js') {
				const logs: string[] = [];
				const sandbox = new Function('console', `"use strict";\n${code}`);
				sandbox({
					log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
					warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(String).join(' ')),
					error: (...args: unknown[]) => logs.push('[error] ' + args.map(String).join(' '))
				});
				output = logs.join('\n') || '(no output)';
			} else {
				output = `▶ Run is only supported for JavaScript in the browser.\nFor ${language}, copy the code to your local environment.`;
				outputError = true;
			}
		} catch (err) {
			output = `Error: ${err instanceof Error ? err.message : String(err)}`;
			outputError = true;
		} finally {
			isRunning = false;
		}
	};
</script>

<div
	role="region"
	aria-label={`Code snippet in ${language || 'code'}`}
	class="my-4 rounded-2xl bg-slate-950 text-slate-100 overflow-hidden border border-border shadow-md"
>
	<!-- Header bar -->
	<div
		class="border-slate-800 bg-slate-900/80 px-4 py-2 text-xs flex items-center justify-between border-b"
	>
		<div class="gap-2 flex items-center">
			<!-- traffic lights -->
			<span class="h-2.5 w-2.5 bg-rose-500/70 rounded-full" aria-hidden="true"></span>
			<span class="h-2.5 w-2.5 bg-amber-500/70 rounded-full" aria-hidden="true"></span>
			<span class="h-2.5 w-2.5 bg-emerald-500/70 rounded-full" aria-hidden="true"></span>
			<span class="ml-2 font-mono font-bold text-slate-400 text-[11px] uppercase"
				>{language || 'code'}</span
			>
		</div>

		<div class="gap-2 flex items-center">
			{#if runnable}
				<button
					type="button"
					onclick={handleRun}
					disabled={isRunning}
					aria-label={isRunning ? 'Executing code...' : `Run ${language} code snippet`}
					class="gap-1.5 border-emerald-700/60 bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-400 hover:bg-emerald-500/25 inline-flex cursor-pointer items-center rounded-md border text-[11px] transition-all active:scale-95 disabled:opacity-50"
				>
					{#if isRunning}
						<span
							class="h-2.5 w-2.5 animate-spin border-emerald-400 rounded-full border-2 border-t-transparent"
							aria-hidden="true"
						></span>
						<span>Running...</span>
					{:else}
						<span>▶ Run</span>
					{/if}
				</button>
			{/if}

			<button
				type="button"
				onclick={handleCopy}
				aria-label={copied ? 'Code snippet copied to clipboard' : 'Copy code snippet to clipboard'}
				class="gap-1 border-slate-700 bg-slate-800 px-2.5 py-1 font-medium hover:bg-slate-700 hover:text-white inline-flex cursor-pointer items-center rounded-md border text-[11px] transition-all active:scale-95 {copied
					? 'border-emerald-700/60 bg-emerald-500/15 text-emerald-400'
					: 'text-slate-300'}"
			>
				{#if copied}
					<span>✓ Copied!</span>
				{:else}
					<svg
						class="h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
					<span>Copy</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- Code -->
	<pre class="p-4 font-mono text-xs leading-relaxed overflow-x-auto"><code>{code}</code></pre>

	<!-- Output panel -->
	{#if showOutput}
		<div
			role="status"
			aria-live="polite"
			class="anim-slide-up border-slate-800 bg-slate-900/60 px-4 py-3 border-t"
		>
			<div class="pb-2 font-bold text-slate-400 flex items-center justify-between text-[10px]">
				<span>Output</span>
				<button
					type="button"
					onclick={() => {
						showOutput = false;
						output = '';
					}}
					aria-label="Close code execution output"
					class="text-slate-500 hover:text-slate-300 cursor-pointer">✕ Close</button
				>
			</div>
			<pre
				class="font-mono leading-relaxed text-[11px] whitespace-pre-wrap {outputError
					? 'text-rose-400'
					: 'text-emerald-300'}">{output}</pre>
		</div>
	{/if}
</div>
