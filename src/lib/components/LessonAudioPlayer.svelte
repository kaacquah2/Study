<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		text: string;
		title?: string;
	}

	let { text, title = 'Lesson Narration' }: Props = $props();

	// Player State
	let isPlaying = $state(false);
	let isPaused = $state(false);
	let rate = $state(1);
	let volume = $state(1);
	let availableVoices = $state<SpeechSynthesisVoice[]>([]);
	let selectedVoiceURI = $state<string>('');
	let supported = $state(true);
	let currentSentenceIndex = $state(0);

	let sentences = $derived.by(() => {
		if (!text) return [];
		// Clean markdown tags & split into logical sentences for tracking
		const clean = text
			.replace(/#+\s+/g, '')
			.replace(/`{1,3}.*?`{1,3}/gs, '')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/[*_~]/g, '');
		return clean
			.split(/(?<=[.!?])\s+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	});

	let progressPercent = $derived(
		sentences.length > 0 ? Math.round(((currentSentenceIndex + 1) / sentences.length) * 100) : 0
	);

	function updateVoices() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			const voices = window.speechSynthesis.getVoices();
			availableVoices = voices;
			if (!selectedVoiceURI && voices.length > 0) {
				const defaultVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
				selectedVoiceURI = defaultVoice.voiceURI;
			}
		}
	}

	onMount(() => {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
			supported = false;
			return;
		}
		updateVoices();
		if (window.speechSynthesis.onvoiceschanged !== undefined) {
			window.speechSynthesis.onvoiceschanged = updateVoices;
		}
	});

	onDestroy(() => {
		stopAudio();
	});

	function speakFromSentence(index: number) {
		if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
		window.speechSynthesis.cancel();

		if (index >= sentences.length) {
			isPlaying = false;
			isPaused = false;
			currentSentenceIndex = 0;
			return;
		}

		currentSentenceIndex = index;
		const sentenceText = sentences[index];
		const utterance = new SpeechSynthesisUtterance(sentenceText);
		utterance.rate = rate;
		utterance.volume = volume;

		if (selectedVoiceURI) {
			const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceURI);
			if (voice) utterance.voice = voice;
		}

		utterance.onend = () => {
			if (isPlaying && !isPaused) {
				speakFromSentence(index + 1);
			}
		};

		utterance.onerror = (e) => {
			console.warn('[LessonAudioPlayer] Speech error:', e);
			if (isPlaying) {
				speakFromSentence(index + 1);
			}
		};

		isPlaying = true;
		isPaused = false;
		window.speechSynthesis.speak(utterance);
	}

	function playAudio() {
		if (isPaused) {
			window.speechSynthesis.resume();
			isPaused = false;
			isPlaying = true;
		} else {
			speakFromSentence(currentSentenceIndex);
		}
	}

	function pauseAudio() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.pause();
			isPaused = true;
			isPlaying = false;
		}
	}

	function stopAudio() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			window.speechSynthesis.cancel();
		}
		isPlaying = false;
		isPaused = false;
		currentSentenceIndex = 0;
	}

	function handleRateChange(newRate: number) {
		rate = newRate;
		if (isPlaying) {
			speakFromSentence(currentSentenceIndex);
		}
	}
</script>

{#if supported}
	<div
		role="region"
		aria-label="Lesson audio player"
		class="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-surface-muted/40 p-4 shadow-sm backdrop-blur-sm transition-all"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"
					aria-hidden="true"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
						/>
					</svg>
				</div>
				<div>
					<h4 class="text-xs font-bold text-text">{title}</h4>
					<p class="text-[11px] text-text-muted" aria-live="polite">
						{#if isPlaying}
							Reading sentence {currentSentenceIndex + 1} of {sentences.length} ({progressPercent}%)
						{:else if isPaused}
							Paused
						{:else}
							Web Speech Audio Narration
						{/if}
					</p>
				</div>
			</div>

			<!-- Controls -->
			<div class="flex items-center gap-2">
				{#if !isPlaying || isPaused}
					<button
						type="button"
						onclick={playAudio}
						class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-primary text-white shadow-sm transition-all hover:bg-primary-hover active:scale-95"
						title="Play Narration"
						aria-label={isPaused ? 'Resume narration audio' : 'Play lesson narration audio'}
					>
						<svg class="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M8 5v14l11-7z" />
						</svg>
					</button>
				{:else}
					<button
						type="button"
						onclick={pauseAudio}
						class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95"
						title="Pause"
						aria-label="Pause narration audio"
					>
						<svg class="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
						</svg>
					</button>
				{/if}

				<button
					type="button"
					onclick={stopAudio}
					disabled={!isPlaying && !isPaused && currentSentenceIndex === 0}
					class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-text-muted transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
					title="Stop"
					aria-label="Stop narration audio"
				>
					<svg class="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 6h12v12H6z" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Options & Progress -->
		<div class="flex items-center justify-between gap-4 border-t border-border/40 pt-2 text-xs">
			<!-- Speed selector -->
			<div class="flex items-center gap-1.5" role="group" aria-label="Audio playback speed">
				<span class="text-[10px] font-bold tracking-wider text-text-muted uppercase">Speed:</span>
				{#each [0.75, 1, 1.25, 1.5] as sRate (sRate)}
					<button
						type="button"
						onclick={() => handleRateChange(sRate)}
						aria-label={`Playback speed ${sRate}x`}
						aria-pressed={rate === sRate}
						class="rounded-lg px-2 py-0.5 text-[10px] font-bold transition-colors {rate === sRate
							? 'bg-primary text-white'
							: 'bg-surface text-text-muted hover:text-text'}"
					>
						{sRate}x
					</button>
				{/each}
			</div>

			<!-- Voice selection if multiple -->
			{#if availableVoices.length > 1}
				<div class="flex max-w-50 flex-col gap-1">
					<select
						bind:value={selectedVoiceURI}
						aria-label="Select narrator voice"
						class="w-full truncate rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] text-text"
					>
						{#each availableVoices.filter((v) => v.lang.startsWith('en')) as voice (voice.voiceURI)}
							<option value={voice.voiceURI}>{voice.name}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<!-- Sentence highlight preview -->
		{#if isPlaying && sentences[currentSentenceIndex]}
			<div
				class="rounded-xl border border-primary/30 bg-primary-soft/30 p-2.5 text-xs text-primary"
				aria-live="polite"
			>
				<span class="font-bold">Reading:</span> "{sentences[currentSentenceIndex]}"
			</div>
		{/if}
	</div>
{/if}
