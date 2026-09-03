<script lang="ts">
	import type { LessonBlock } from '$lib/firebase/converters';
	import TextBlock from './TextBlock.svelte';
	import CalloutBlock from './CalloutBlock.svelte';
	import TermChip from './TermChip.svelte';
	import InlineCheck from './InlineCheck.svelte';
	import FlashcardFlip from './FlashcardFlip.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import MindmapNodeChip from './MindmapNodeChip.svelte';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';

	interface Props {
		blocks: LessonBlock[];
		courseId?: string;
		moduleId?: string;
	}

	let { blocks, courseId, moduleId }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	{#if blocks && blocks.length > 0}
		{#each blocks as block, idx (idx)}
			{#if block.type === 'text'}
				<TextBlock markdown={block.markdown} />
			{:else if block.type === 'callout'}
				<CalloutBlock style={block.style} title={block.title} markdown={block.markdown} />
			{:else if block.type === 'diagram'}
				<div class="my-4">
					<MermaidDiagram code={block.mermaid} />
					{#if block.caption}
						<p class="mt-1.5 text-center text-xs text-text-muted italic">{block.caption}</p>
					{/if}
				</div>
			{:else if block.type === 'term'}
				<div class="my-1">
					<TermChip term={block.term} definition={block.definition} />
				</div>
			{:else if block.type === 'check'}
				<InlineCheck
					prompt={block.prompt}
					options={block.options}
					answerIndex={block.answerIndex}
					explanation={block.explanation}
				/>
			{:else if block.type === 'flashcard'}
				<FlashcardFlip front={block.front} back={block.back} {courseId} {moduleId} />
			{:else if block.type === 'code'}
				<CodeBlock language={block.language} code={block.code} runnable={block.runnable} />
			{:else if block.type === 'mindmap-node'}
				<MindmapNodeChip nodeId={block.nodeId} label={block.label} {courseId} />
			{/if}
		{/each}
	{/if}
</div>
