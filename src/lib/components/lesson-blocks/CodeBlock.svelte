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
	class="my-4 overflow-hidden rounded-2xl border border-border bg-slate-950 text-slate-100 shadow-md"
>
	<!-- Header bar -->
	<div
		class="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs"
	>
		<div class="flex items-center gap-2">
			<!-- traffic lights -->
			<span class="h-2.5 w-2.5 rounded-full bg-rose-500/70" aria-hidden="true"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-amber-500/70" aria-hidden="true"></span>
			<span class="h-2.5 w-2.5 rounded-full bg-emerald-500/70" aria-hidden="true"></span>
			<span class="ml-2 font-mono text-[11px] font-bold text-slate-400 uppercase"
				>{language || 'code'}</span
			>
		</div>

		<div class="flex items-center gap-2">
			{#if runnable}
				<button
					type="button"
					onclick={handleRun}
					disabled={isRunning}
					aria-label={isRunning ? 'Executing code...' : `Run ${language} code snippet`}
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 transition-all hover:bg-emerald-500/25 active:scale-95 disabled:opacity-50"
				>
					{#if isRunning}
						<span
							class="h-2.5 w-2.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
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
				class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium transition-all hover:bg-slate-700 hover:text-white active:scale-95 {copied
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
	<pre class="overflow-x-auto p-4 font-mono text-xs leading-relaxed"><code>{code}</code></pre>

	<!-- Output panel -->
	{#if showOutput}
		<div
			role="status"
			aria-live="polite"
			class="anim-slide-up border-t border-slate-800 bg-slate-900/60 px-4 py-3"
		>
			<div class="flex items-center justify-between pb-2 text-[10px] font-bold text-slate-400">
				<span>Output</span>
				<button
					type="button"
					onclick={() => {
						showOutput = false;
						output = '';
					}}
					aria-label="Close code execution output"
					class="cursor-pointer text-slate-500 hover:text-slate-300">✕ Close</button
				>
			</div>
			<pre
				class="font-mono text-[11px] leading-relaxed whitespace-pre-wrap {outputError
					? 'text-rose-400'
					: 'text-emerald-300'}">{output}</pre>
		</div>
	{/if}
</div>
