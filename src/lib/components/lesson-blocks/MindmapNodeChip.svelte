<script lang="ts">
	interface Props {
		nodeId: string;
		label: string;
		courseId?: string;
	}

	let { nodeId, label, courseId }: Props = $props();
</script>

<div class="my-2 inline-flex items-center">
	<a
		href={`/app/knowledge-map?${courseId ? `courseId=${courseId}&` : ''}focus=${encodeURIComponent(nodeId)}`}
		class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/40 px-3 py-1 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95"
	>
		<span>🔗 See "{label}" in Knowledge Map</span>
	</a>
</div>
