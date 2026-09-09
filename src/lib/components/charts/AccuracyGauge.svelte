<script lang="ts">
	interface Props {
		accuracy: number; // 0 - 100
		totalAnswered?: number;
		label?: string;
	}

	let { accuracy = 0, totalAnswered = 0, label = 'Overall Accuracy' }: Props = $props();

	// Clamped accuracy
	let clampedAcc = $derived(Math.max(0, Math.min(100, Math.round(accuracy))));

	// Grade and color scheme derived from accuracy
	let gradeInfo = $derived.by(() => {
		if (totalAnswered === 0) {
			return {
				grade: 'N/A',
				status: 'No data yet',
				color: 'var(--text-muted)',
				gradientStart: '#94a3b8',
				gradientEnd: '#64748b',
				bgBadge: 'rgba(148, 163, 184, 0.1)',
				textBadge: '#94a3b8'
			};
		}
		if (clampedAcc >= 85) {
			return {
				grade: 'Mastery',
				status: 'Exceptional retention',
				color: '#10b981',
				gradientStart: '#34d399',
				gradientEnd: '#059669',
				bgBadge: 'rgba(16, 185, 129, 0.12)',
				textBadge: '#10b981'
			};
		}
		if (clampedAcc >= 70) {
			return {
				grade: 'Proficient',
				status: 'On track to master',
				color: '#3b82f6',
				gradientStart: '#60a5fa',
				gradientEnd: '#2563eb',
				bgBadge: 'rgba(59, 130, 246, 0.12)',
				textBadge: '#3b82f6'
			};
		}
		if (clampedAcc >= 50) {
			return {
				grade: 'Developing',
				status: 'Review recommended',
				color: '#f59e0b',
				gradientStart: '#fbbf24',
				gradientEnd: '#d97706',
				bgBadge: 'rgba(245, 158, 11, 0.12)',
				textBadge: '#f59e0b'
			};
		}
		return {
			grade: 'Needs Focus',
			status: 'High mistake rate',
			color: '#f43f5e',
			gradientStart: '#fb7185',
			gradientEnd: '#e11d48',
			bgBadge: 'rgba(244, 63, 94, 0.12)',
			textBadge: '#f43f5e'
		};
	});

	// SVG 240-degree arc parameters
	const radius = 64;
	const strokeWidth = 10;
	// Circumference of 240 degrees out of 360
	const arcAngle = 240;
	const fullCircumference = 2 * Math.PI * radius;
	const arcLength = (arcAngle / 360) * fullCircumference;

	// Progress dashoffset: at 0% offset = arcLength, at 100% offset = 0
	let strokeDashoffset = $derived(arcLength - (clampedAcc / 100) * arcLength);
</script>

<div
	class="relative flex flex-col items-center justify-center p-4"
	role="meter"
	aria-valuenow={clampedAcc}
	aria-valuemin="0"
	aria-valuemax="100"
	aria-label={label}
>
	<!-- SVG Radial Gauge -->
	<div class="relative flex items-center justify-center">
		<svg
			class="h-44 w-44 rotate-[-210deg] transform"
			viewBox="0 0 160 160"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stop-color={gradeInfo.gradientStart} />
					<stop offset="100%" stop-color={gradeInfo.gradientEnd} />
				</linearGradient>
				<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
					<feGaussianBlur stdDeviation="3" result="blur" />
					<feComposite in="SourceGraphic" in2="blur" operator="over" />
				</filter>
			</defs>

			<!-- Background Track -->
			<circle
				cx="80"
				cy="80"
				r={radius}
				stroke="currentColor"
				stroke-width={strokeWidth}
				stroke-linecap="round"
				class="text-border/60"
				stroke-dasharray={`${arcLength} ${fullCircumference}`}
			/>

			<!-- Animated Progress Arc -->
			<circle
				cx="80"
				cy="80"
				r={radius}
				stroke="url(#gaugeGradient)"
				stroke-width={strokeWidth}
				stroke-linecap="round"
				stroke-dasharray={`${arcLength} ${fullCircumference}`}
				stroke-dashoffset={strokeDashoffset}
				style="transition: stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1);"
				filter="url(#glow)"
			/>
		</svg>

		<!-- Center Stat Display -->
		<div class="absolute inset-0 flex flex-col items-center justify-center text-center">
			<div class="flex items-baseline justify-center">
				<span class="font-display text-4xl font-extrabold tracking-tight text-text">
					{clampedAcc}
				</span>
				<span class="ml-0.5 text-base font-bold text-text-muted">%</span>
			</div>
			<span
				class="mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase transition-colors"
				style="background: {gradeInfo.bgBadge}; color: {gradeInfo.textBadge};"
			>
				{gradeInfo.grade}
			</span>
		</div>
	</div>

	<!-- Bottom Label & Status -->
	<div class="mt-2 text-center">
		<h4 class="text-xs font-semibold tracking-wide text-text-muted uppercase">{label}</h4>
		<p class="mt-0.5 text-xs font-medium text-text">
			{gradeInfo.status}
		</p>
	</div>
</div>
