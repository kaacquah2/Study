<script lang="ts">
	import CourseCard from '$lib/components/CourseCard.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import BadgeStrip from '$lib/components/BadgeStrip.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { db, auth } from '$lib/firebase/client';
	import { collection, query, where, onSnapshot } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import type { CourseDoc } from '$lib/firebase/converters';

	let courses = $state<CourseDoc[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let shareUrl = $state('');
	let showShareModal = $state(false);
	let showAchievements = $state(false);
	let showOnboardingDismissed = $state(false);

	let showOnboardingModal = $derived(
		!loading &&
			authStore.authResolved &&
			Boolean(authStore.user) &&
			!showOnboardingDismissed &&
			authStore.profile?.onboardingComplete !== true &&
			courses.length === 0
	);

	let firstName = $derived.by(() => {
		const name = authStore.user?.displayName || authStore.profile?.displayName;
		if (name) return name.split(' ')[0];
		const email = authStore.user?.email;
		if (email) return email.split('@')[0];
		return 'Learner';
	});

	let greetingTime = $derived.by(() => {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 18) return 'Good afternoon';
		return 'Good evening';
	});

	let currentStreak = $derived(authStore.profile?.streak?.current ?? 0);
	let longestStreak = $derived(
		authStore.profile?.streak?.longest ?? authStore.profile?.longestStreak ?? currentStreak
	);
	let lastStudiedOn = $derived(authStore.profile?.streak?.lastStudiedOn || null);

	let studiedToday = $derived.by(() => {
		if (!lastStudiedOn) return false;
		const todayStr = new Date().toISOString().split('T')[0];
		return String(lastStudiedOn).startsWith(todayStr);
	});

	let userBadges = $derived(authStore.profile?.badges ?? []);

	const topicSuggestions = [
		{ label: 'Python Basics', topic: 'Python Programming for Beginners' },
		{ label: 'World History', topic: 'Major Events of World War II' },
		{ label: 'Linear Algebra', topic: 'Linear Algebra Fundamentals' },
		{ label: 'Machine Learning', topic: 'Introduction to Machine Learning' }
	];

	const handleSelectSuggestion = (topic: string) => {
		goto(`/app/courses/createCourse?topic=${encodeURIComponent(topic)}`);
	};

	let dueReviewsCount = $state(0);

	// Categorize In-Progress vs Completed courses
	let inProgressCourses = $derived(
		courses.filter((c) => {
			const completed = c.progress?.completed || 0;
			const total = c.moduleCount || 1;
			return completed < total;
		})
	);

	let completedCourses = $derived(
		courses.filter((c) => {
			const completed = c.progress?.completed || 0;
			const total = c.moduleCount || 1;
			return total > 0 && completed >= total;
		})
	);

	// Most relevant abandoned/in-progress course
	let abandonedCourse = $derived.by(() => {
		return inProgressCourses.find((c) => {
			const completed = c.progress?.completed || 0;
			const total = c.moduleCount || 1;
			return completed > 0 && completed < total;
		});
	});

	// Deterministic Learning Recommendation logic (Priority 1 -> 4)
	let primaryRecommendation = $derived.by(() => {
		if (dueReviewsCount > 0) {
			return {
				type: 'review' as const,
				badge: '🧠 Active Recall Due',
				badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
				cardBg: 'border-amber-500/30 bg-linear-to-br from-amber-500/10 via-surface to-surface',
				btnBg: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
				title: `Review ${dueReviewsCount} Due Question${dueReviewsCount > 1 ? 's' : ''}`,
				description:
					'Strengthen long-term memory with FSRS spaced repetition before concepts begin to decay.',
				actionLabel: 'Start Review Session →',
				actionHref: '/app/review'
			};
		}
		if (abandonedCourse) {
			const completed = abandonedCourse.progress?.completed || 0;
			const total = abandonedCourse.moduleCount || 1;
			const pct = Math.min(100, Math.round((completed / total) * 100));
			return {
				type: 'continue' as const,
				badge: '📍 Resume Learning',
				badgeBg: 'bg-primary-soft border-primary/40 text-primary',
				cardBg: 'border-primary/30 bg-linear-to-br from-primary-soft/30 via-surface to-surface',
				btnBg: 'bg-primary text-white hover:bg-primary-hover',
				title: `Continue "${abandonedCourse.title}"`,
				description: `You are ${pct}% through (${completed}/${total} modules completed). Keep your momentum going!`,
				actionLabel: 'Resume Course →',
				actionHref: `/app/courses/${abandonedCourse.id}`
			};
		}
		if (inProgressCourses.length > 0) {
			const c = inProgressCourses[0];
			return {
				type: 'continue' as const,
				badge: '🚀 Continue Learning',
				badgeBg: 'bg-primary-soft border-primary/40 text-primary',
				cardBg: 'border-primary/30 bg-linear-to-br from-primary-soft/30 via-surface to-surface',
				btnBg: 'bg-primary text-white hover:bg-primary-hover',
				title: `Next Up: "${c.title}"`,
				description:
					c.description ||
					'Master key concepts through interactive explanations, checks, and quizzes.',
				actionLabel: 'Open Course →',
				actionHref: `/app/courses/${c.id}`
			};
		}
		if (courses.length > 0) {
			return {
				type: 'explore' as const,
				badge: '🎓 All Courses Complete',
				badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
				cardBg: 'border-emerald-500/30 bg-linear-to-br from-emerald-500/10 via-surface to-surface',
				btnBg: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
				title: 'Great job! Explore a New Topic',
				description:
					'You have mastered all your courses. Create a new AI curriculum or explore shared courses.',
				actionLabel: '+ Create New Course',
				actionHref: '/app/courses/createCourse'
			};
		}
		return {
			type: 'create' as const,
			badge: '🌱 Welcome to Study AI',
			badgeBg: 'bg-primary-soft border-primary/40 text-primary',
			cardBg: 'border-primary/30 bg-linear-to-br from-primary-soft/30 via-surface to-surface',
			btnBg: 'bg-primary text-white hover:bg-primary-hover',
			title: 'Build Your First Intelligent Course',
			description:
				'Generate structured lessons, quizzes, mindmaps, and active-recall flashcards from any topic.',
			actionLabel: '+ Create Your First Course',
			actionHref: '/app/courses/createCourse'
		};
	});

	$effect(() => {
		if (authStore.user) {
			const q = query(collection(db, 'courses'), where('ownerUid', '==', authStore.user.uid));

			const unsub = onSnapshot(
				q,
				(snapshot) => {
					const fetched = snapshot.docs.map((doc) => ({
						id: doc.id,
						...doc.data()
					})) as CourseDoc[];

					// Sort client-side by createdAt descending
					fetched.sort((a, b) => {
						const tA =
							typeof a.createdAt === 'object' && a.createdAt && 'toMillis' in a.createdAt
								? (a.createdAt as { toMillis: () => number }).toMillis()
								: 0;
						const tB =
							typeof b.createdAt === 'object' && b.createdAt && 'toMillis' in b.createdAt
								? (b.createdAt as { toMillis: () => number }).toMillis()
								: 0;
						return tB - tA;
					});

					courses = fetched;
					loading = false;
				},
				(error) => {
					console.error('Firestore courses error:', error);
					loadError = 'Failed to load courses. Please check network connection.';
					loading = false;
				}
			);

			// Fetch due spaced-repetition questions count
			fetchDueReviews();

			return () => unsub();
		}
	});

	const fetchDueReviews = async () => {
		try {
			const idToken = await auth.currentUser?.getIdToken();
			const res = await fetch('/api/spaced-repetition/due', {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			if (res.ok) {
				const data = await res.json();
				dueReviewsCount = data.count || 0;
			}
		} catch (e) {
			console.error('Error loading due reviews:', e);
		}
	};

	const handleOpenShare = async (courseId: string) => {
		shareUrl = `${window.location.origin}/shared/${courseId}`;
		showShareModal = true;
	};
</script>

<svelte:head>
	<title>Dashboard &mdash; Study AI</title>
</svelte:head>

<div class="gap-7 flex w-full flex-col">
	<!-- Zone 1: Personalized Header Banner with Verified Streak Stats -->
	<div
		class="rounded-3xl from-indigo-950 via-indigo-900 to-purple-950 p-6 text-white shadow-xl sm:p-8 relative overflow-hidden bg-linear-to-r"
	>
		<div class="-top-12 -right-12 h-64 w-64 bg-purple-500/15 blur-3xl absolute rounded-full"></div>
		<div class="gap-6 md:flex-row md:items-center relative z-10 flex flex-col justify-between">
			<div class="gap-2 flex flex-col">
				<div class="gap-2 inline-flex items-center">
					<span
						class="border-indigo-300/30 bg-indigo-500/25 px-3 py-1 text-xs font-semibold text-indigo-200 rounded-full border"
					>
						{greetingTime}, {firstName} 👋
					</span>
					{#if studiedToday}
						<span
							class="border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 font-bold text-emerald-300 rounded-full border text-[11px]"
						>
							✓ Studied Today
						</span>
					{/if}
				</div>

				<h1 class="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
					What would you like to learn today?
				</h1>

				<!-- Verified Streak Info Pill -->
				<div class="mt-1 gap-3 text-xs text-indigo-200/90 flex flex-wrap items-center">
					<span class="gap-1.5 font-semibold flex items-center">
						<span class="text-base">🔥</span>
						<strong>{currentStreak} day streak</strong>
						{#if longestStreak > currentStreak}
							<span class="text-indigo-300/60">(Best: {longestStreak}d)</span>
						{/if}
					</span>
					<span class="text-indigo-300/40">•</span>
					<span>{courses.length} course{courses.length === 1 ? '' : 's'} enrolled</span>
					{#if dueReviewsCount > 0}
						<span class="text-indigo-300/40">•</span>
						<span class="font-bold text-amber-300">🧠 {dueReviewsCount} cards due</span>
					{/if}
				</div>
			</div>

			<div class="gap-3 flex shrink-0 items-center">
				<a
					href="/app/courses/createCourse"
					class="gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-bold text-indigo-950 hover:bg-indigo-50 inline-flex items-center justify-center shadow-lg transition-all duration-180 active:scale-95"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<span>+ New Course</span>
				</a>
			</div>
		</div>
	</div>

	<!-- Zone 2: Today's Focus — Deterministic Primary Learning Recommendation -->
	<section class="gap-3 flex flex-col">
		<div class="flex items-center justify-between">
			<h2 class="font-display text-sm font-bold tracking-wider text-text-muted uppercase">
				🎯 Today's Learning Focus
			</h2>
			{#if dueReviewsCount > 0}
				<span
					class="bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-500 rounded-full text-[11px]"
				>
					{dueReviewsCount} due for review
				</span>
			{/if}
		</div>

		<div class="rounded-3xl p-6 sm:p-7 border shadow-sm {primaryRecommendation.cardBg}">
			<div class="gap-6 md:flex-row md:items-center flex flex-col justify-between">
				<div class="max-w-2xl gap-2 flex flex-col">
					<div
						class="gap-1.5 px-3 py-1 font-black tracking-wider inline-flex items-center self-start rounded-full border text-[10px] uppercase {primaryRecommendation.badgeBg}"
					>
						<span>{primaryRecommendation.badge}</span>
					</div>
					<h3 class="font-display text-lg font-bold sm:text-xl text-text">
						{primaryRecommendation.title}
					</h3>
					<p class="text-xs leading-relaxed sm:text-sm text-text-muted">
						{primaryRecommendation.description}
					</p>
				</div>

				<div class="gap-3 flex shrink-0 items-center">
					<a
						href={primaryRecommendation.actionHref}
						class="gap-2 rounded-2xl px-6 py-3.5 text-xs font-bold inline-flex items-center justify-center shadow-md transition-all duration-180 hover:scale-[1.02] active:scale-95 {primaryRecommendation.btnBg}"
					>
						<span>{primaryRecommendation.actionLabel}</span>
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- Quick Action Learning Grid -->
	<div class="gap-4 sm:grid-cols-3 grid grid-cols-1">
		<!-- 1. Practice & Recall -->
		<a
			href="/app/review"
			class="group rounded-2xl p-4.5 shadow-2xs flex items-center justify-between border border-border bg-surface transition-all duration-180 hover:border-primary/40 hover:bg-surface-muted/50"
		>
			<div class="gap-3.5 flex items-center">
				<div
					class="h-10 w-10 bg-amber-500/15 text-lg flex shrink-0 items-center justify-center rounded-xl"
				>
					🧠
				</div>
				<div>
					<h4 class="font-display text-xs font-bold text-text group-hover:text-primary">
						Practice & Recall
					</h4>
					<p class="text-[11px] text-text-muted">
						{dueReviewsCount > 0 ? `${dueReviewsCount} questions due` : 'FSRS Memory scheduler'}
					</p>
				</div>
			</div>
			<span class="text-xs group-hover:translate-x-0.5 text-text-muted transition-transform">→</span
			>
		</a>

		<!-- 2. Knowledge Map -->
		<a
			href="/app/knowledge-map"
			class="group rounded-2xl p-4.5 shadow-2xs flex items-center justify-between border border-border bg-surface transition-all duration-180 hover:border-primary/40 hover:bg-surface-muted/50"
		>
			<div class="gap-3.5 flex items-center">
				<div
					class="h-10 w-10 text-lg flex shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
				>
					🗺️
				</div>
				<div>
					<h4 class="font-display text-xs font-bold text-text group-hover:text-primary">
						Knowledge Map
					</h4>
					<p class="text-[11px] text-text-muted">Prerequisite concept tree</p>
				</div>
			</div>
			<span class="text-xs group-hover:translate-x-0.5 text-text-muted transition-transform">→</span
			>
		</a>

		<!-- 3. AI Study Tutor -->
		<button
			type="button"
			onclick={() => chatStore.toggle()}
			class="group rounded-2xl p-4.5 shadow-2xs flex cursor-pointer items-center justify-between border border-border bg-surface text-left transition-all duration-180 hover:border-primary/40 hover:bg-surface-muted/50"
		>
			<div class="gap-3.5 flex items-center">
				<div
					class="h-10 w-10 bg-purple-500/15 text-lg text-purple-600 flex shrink-0 items-center justify-center rounded-xl"
				>
					✨
				</div>
				<div>
					<h4 class="font-display text-xs font-bold text-text group-hover:text-primary">
						AI Study Tutor
					</h4>
					<p class="text-[11px] text-text-muted">Ask questions & explanations</p>
				</div>
			</div>
			<span class="text-xs group-hover:translate-x-0.5 text-text-muted transition-transform">→</span
			>
		</button>
	</div>

	<!-- Zone 3 & 4: Course Section -->
	<section class="gap-6 pt-2 flex flex-col">
		<div class="flex items-center justify-between">
			<h2 class="font-display text-lg font-bold text-text">
				My Courses ({courses.length})
			</h2>
			{#if courses.length > 0}
				<a href="/app/courses/createCourse" class="text-xs font-bold text-primary hover:underline">
					+ New Course
				</a>
			{/if}
		</div>

		{#if loading}
			<div class="gap-6 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
				<Skeleton variant="card" />
				<Skeleton variant="card" />
				<Skeleton variant="card" />
			</div>
		{:else if loadError}
			<div
				class="rounded-2xl p-6 text-xs font-bold border border-danger/20 bg-danger-soft text-center text-danger"
			>
				{loadError}
			</div>
		{:else if courses.length === 0}
			<EmptyState
				title="No courses created yet"
				description="Start your learning journey by generating your first AI-powered course on any topic, or explore community materials."
				actionLabel="+ Create First Course"
				onAction={() => goto('/app/courses/createCourse')}
				secondaryActionLabel="or explore community courses"
				secondaryActionHref="/app/explore"
				suggestions={topicSuggestions}
				onSelectSuggestion={handleSelectSuggestion}
			/>
		{:else}
			{@const recentCourse = inProgressCourses[0] || courses[0]}
			{@const completedCount = recentCourse.progress?.completed ?? 0}
			{@const totalCount = recentCourse.moduleCount ?? 1}
			{@const pct = Math.min(100, Math.round((completedCount / totalCount) * 100))}

			<!-- Prominent Resume / Active Course Card -->
			<div
				class="rounded-3xl p-6 shadow-xs sm:p-8 relative overflow-hidden border border-primary/25 bg-surface"
			>
				<div class="gap-6 md:flex-row md:items-center flex flex-col justify-between">
					<div class="max-w-2xl gap-2.5 flex flex-col">
						<div
							class="gap-1.5 px-3 py-1 font-black tracking-wider inline-flex items-center self-start rounded-full border border-primary/30 bg-primary-soft/80 text-[10px] text-primary uppercase"
						>
							<span>📍 Pick up where you left off</span>
						</div>
						<h3 class="font-display text-xl font-bold tracking-tight sm:text-2xl text-text">
							{recentCourse.title}
						</h3>
						<p class="text-xs leading-relaxed sm:text-sm line-clamp-2 text-text-muted">
							{recentCourse.description}
						</p>

						<!-- Progress Stats -->
						<div class="mt-2 gap-1.5 flex flex-col">
							<div class="text-xs font-bold flex items-center justify-between">
								<span class="text-text-muted"
									>{completedCount} of {totalCount} modules completed</span
								>
								<span class="text-primary">{pct}% Complete</span>
							</div>
							<div class="h-2 w-full overflow-hidden rounded-full bg-border/60">
								<div
									class="h-full rounded-full bg-primary transition-all duration-500"
									style="width: {pct}%"
								></div>
							</div>
						</div>
					</div>

					<div class="gap-3 sm:flex-row md:flex-col flex shrink-0 flex-col items-stretch">
						<a
							href={`/app/courses/${recentCourse.id}`}
							class="gap-2 rounded-2xl px-6 py-3.5 text-xs font-bold text-white inline-flex items-center justify-center bg-primary shadow-md shadow-primary/20 transition-all duration-180 hover:scale-[1.02] hover:bg-primary-hover active:scale-95"
						>
							<span>Resume Learning</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.5"
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</a>

						<button
							type="button"
							onclick={() => handleOpenShare(recentCourse.id || '')}
							class="gap-2 rounded-2xl px-4 py-3 text-xs font-bold inline-flex items-center justify-center border border-border bg-surface text-text-muted hover:border-primary/40 hover:text-text"
						>
							<span>🔗 Share Course</span>
						</button>
					</div>
				</div>
			</div>

			<!-- In Progress Courses -->
			{#if inProgressCourses.length > 0}
				<div class="gap-4 pt-2 flex flex-col">
					<h3 class="font-display text-xs font-bold tracking-wider text-text-muted uppercase">
						In Progress ({inProgressCourses.length})
					</h3>
					<div class="gap-6 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
						{#each inProgressCourses as course, idx (course.id)}
							<div class="anim-slide-up" style="animation-delay: {idx * 60}ms">
								<CourseCard
									id={course.id || ''}
									title={course.title}
									description={course.description}
									status={course.status}
									accent={course.accent || 'violet'}
									moduleCount={course.moduleCount}
									progress={course.progress}
									onShare={() => handleOpenShare(course.id || '')}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Completed Courses -->
			{#if completedCourses.length > 0}
				<div class="gap-4 pt-4 flex flex-col">
					<h3 class="font-display text-xs font-bold tracking-wider text-emerald-500 uppercase">
						🎓 Completed Courses & Certificates ({completedCourses.length})
					</h3>
					<div class="gap-6 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
						{#each completedCourses as course, idx (course.id)}
							<div class="anim-slide-up" style="animation-delay: {idx * 60}ms">
								<CourseCard
									id={course.id || ''}
									title={course.title}
									description={course.description}
									status={course.status}
									accent={course.accent || 'emerald'}
									moduleCount={course.moduleCount}
									progress={course.progress}
									onShare={() => handleOpenShare(course.id || '')}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</section>

	<!-- Zone 5: Collapsible Achievements Section -->
	{#if userBadges.length > 0}
		<section class="gap-3 rounded-2xl p-5 shadow-xs flex flex-col border border-border bg-surface">
			<button
				type="button"
				onclick={() => (showAchievements = !showAchievements)}
				class="flex w-full cursor-pointer items-center justify-between text-left"
			>
				<div class="gap-2 flex items-center">
					<span class="text-base">🏆</span>
					<h3 class="font-display text-sm font-bold text-text">Your Achievements</h3>
					<span class="px-2 py-0.5 font-bold rounded-full bg-primary-soft text-[10px] text-primary">
						{userBadges.length} Unlocked
					</span>
				</div>
				<span
					class="text-xs text-text-muted transition-transform duration-200 {showAchievements
						? 'rotate-180'
						: ''}"
				>
					▼
				</span>
			</button>

			{#if showAchievements}
				<div class="pt-2">
					<BadgeStrip badges={userBadges} />
				</div>
			{/if}
		</section>
	{/if}
</div>

<ShareModal
	show={showShareModal}
	{shareUrl}
	courseTitle="Shared Course"
	onClose={() => (showShareModal = false)}
/>

{#if showOnboardingModal}
	<Onboarding onClose={() => (showOnboardingDismissed = true)} />
{/if}
