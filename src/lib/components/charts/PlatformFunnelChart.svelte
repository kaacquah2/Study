<script lang="ts">
	interface FunnelStage {
		stage: string;
		count: number;
		description?: string;
	}

	interface Props {
		stages?: FunnelStage[];
		title?: string;
	}

	let {
		stages = [
			{ stage: 'Registered Accounts', count: 1, description: 'Total platform users' },
			{ stage: 'Created Courses', count: 1, description: 'Generated ≥1 AI course' },
			{ stage: 'Active in Quizzes', count: 1, description: 'Submitted quiz attempts' },
			{ stage: 'Completed Modules', count: 1, description: 'Finished study modules' },
			{ stage: 'Mastery Tier (≥85%)', count: 1, description: 'High retention learners' }
		],
		title = 'Platform Learning Lifecycle Funnel'
	}: Props = $props();

	const maxCount = $derived.by(() => {
		const m = Math.max(...stages.map((s) => s.count), 1);
		return m;
	});

	const stageGradients = [
		'from-primary to-indigo-600',
		'from-indigo-600 to-violet-600',
		'from-violet-600 to-purple-600',
		'from-purple-600 to-emerald-600',
		'from-emerald-500 to-teal-500'
	];
</script>

<div class="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h3 class="font-display text-sm font-bold text-text">{title}</h3>
				<span class="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
					Conversion
				</span>
			</div>
			<p class="mt-0.5 text-xs text-text-muted">
				Cohort progression through signup, curriculum engagement, and knowledge mastery.
			</p>
		</div>
		<span class="text-xs font-semibold text-text-muted">End-to-End Retention</span>
	</div>

	<!-- Funnel Steps -->
	<div class="my-3 flex flex-col gap-2.5">
		{#each stages as stage, idx (stage.stage)}
			{@const widthPct = Math.max(12, Math.round((stage.count / maxCount) * 100))}
			{@const prevCount = idx > 0 ? stages[idx - 1].count : null}
			{@const stepConversion = prevCount && prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : null}
			{@const gradient = stageGradients[idx % stageGradients.length]}

			<div class="flex flex-col gap-1">
				<div class="flex items-center justify-between text-xs">
					<div class="flex items-center gap-2">
						<span class="flex h-5 w-5 items-center justify-center rounded-md bg-surface-muted text-[10px] font-bold text-text-muted">
							{idx + 1}
						</span>
						<span class="font-bold text-text">{stage.stage}</span>
						{#if stage.description}
							<span class="hidden text-[11px] text-text-muted sm:inline">({stage.description})</span>
						{/if}
					</div>

					<div class="flex items-center gap-2 font-mono">
						<span class="font-black text-text">{stage.count}</span>
						{#if stepConversion !== null}
							<span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold {stepConversion >= 70 ? 'text-emerald-500' : 'text-amber-500'}">
								{stepConversion}%
							</span>
						{/if}
					</div>
				</div>

				<!-- Visual Bar -->
				<div class="h-3 w-full overflow-hidden rounded-full bg-surface-muted">
					<div
						class="h-full rounded-full bg-linear-to-r {gradient} transition-all duration-500"
						style="width: {widthPct}%;"
					></div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Bottom summary footer -->
	<div class="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-text-muted">
		<span>Calculated across all registered student and admin cohorts.</span>
		<span class="font-medium text-primary">Live Data</span>
	</div>
</div>
