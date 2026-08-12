<script lang="ts">
	import CourseCard from '$lib/components/CourseCard.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import BadgeStrip from '$lib/components/BadgeStrip.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { db, auth } from '$lib/firebase/client';
	import { collection, query, where, onSnapshot } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import type { CourseDoc } from '$lib/firebase/converters';

	let courses = $state<CourseDoc[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let shareUrl = $state('');
	let showShareModal = $state(false);

	let firstName = $derived.by(() => {
		const name = authStore.user?.displayName || authStore.profile?.displayName;
		if (name) return name.split(' ')[0];
		const email = authStore.user?.email;
		if (email) return email.split('@')[0];
		return 'Learner';
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

	// Item #15: Categorize In-Progress vs Completed courses
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

	// Item #14: Abandoned Course Re-engagement
	let abandonedCourse = $derived.by(() => {
		return inProgressCourses.find((c) => {
			const completed = c.progress?.completed || 0;
			const total = c.moduleCount || 1;
			return completed > 0 && completed < total;
		});
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
	<title>Dashboard &mdash; AI Study Buddy</title>
</svelte:head>

<div class="flex w-full flex-col gap-8">
	<!-- Welcome Header Banner -->
	<div
		class="relative overflow-hidden rounded-3xl bg-linear-to-r from-indigo-900 via-indigo-800 to-purple-900 p-6 text-white shadow-xl sm:p-8"
	>
		<div class="absolute -top-10 -right-10 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl"></div>
		<div class="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
			<div>
				<div
					class="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200"
				>
					<span>👋 Welcome back, {firstName}</span>
				</div>
				<h1 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">
					Your Learning Dashboard
				</h1>
				<p class="mt-1 text-xs text-indigo-200/80 sm:text-sm">
					Track your daily progress, earn badges, and explore interactive AI courses.
				</p>
			</div>

			<a
				href="/app/courses/createCourse"
				class="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-xs font-bold text-indigo-900 shadow-lg transition-all duration-180 hover:bg-indigo-50 active:scale-95"
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
				+ Create New Course
			</a>
		</div>
	</div>

	<!-- Spaced-Repetition Due Review Card Nudge -->
	{#if dueReviewsCount > 0}
		<div
			class="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-xs"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg font-bold text-slate-950"
				>
					🧠
				</div>
				<div>
					<h3 class="font-display text-sm font-bold text-text">Spaced-Repetition Memory Boost</h3>
					<p class="text-xs text-text-muted">
						You have <strong
							>{dueReviewsCount} question{dueReviewsCount > 1 ? 's' : ''} due for review</strong
						> today to strengthen long-term recall.
					</p>
				</div>
			</div>
			<a
				href="/app/review"
				class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs transition-all hover:bg-amber-400 active:scale-95"
			>
				Start Review Session &rarr;
			</a>
		</div>
	{/if}

	<!-- Item #14: Abandoned Course Idle Re-engagement Nudge Banner -->
	{#if abandonedCourse}
		{@const completed = abandonedCourse.progress?.completed || 0}
		{@const total = abandonedCourse.moduleCount || 1}
		{@const pct = Math.min(100, Math.round((completed / total) * 100))}
		<div
			class="flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 shadow-xs"
		>
			<div class="flex items-center gap-3">
				<span class="text-2xl">⏳</span>
				<div>
					<h4 class="font-display text-xs font-bold tracking-wider text-indigo-300 uppercase">
						Keep your momentum going!
					</h4>
					<p class="text-xs font-semibold text-text">
						You're <strong>{pct}% through "{abandonedCourse.title}"</strong> ({completed}/{total} modules
						completed). Pick up where you left off!
					</p>
				</div>
			</div>
			<a
				href={`/app/courses/${abandonedCourse.id}`}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-600 active:scale-95"
			>
				Resume Course &rarr;
			</a>
		</div>
	{/if}

	<!-- Badges Strip -->
	<div class="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs">
		<div class="flex items-center justify-between">
			<h3 class="font-display text-sm font-bold text-text">Your Achievements</h3>
			<span class="text-xs font-semibold text-text-muted"
				>{userBadges.length} of 5 badges unlocked</span
			>
		</div>
		<BadgeStrip badges={userBadges} />
	</div>

	<!-- Course Grid Section -->
	<div class="flex flex-col gap-6">
		<div class="flex items-center justify-between">
			<h2 class="font-display text-lg font-bold text-text">My Courses ({courses.length})</h2>
		</div>

		{#if loading}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
				<Skeleton variant="card" />
				<Skeleton variant="card" />
				<Skeleton variant="card" />
			</div>
		{:else if loadError}
			<div
				class="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center text-xs font-bold text-danger"
			>
				{loadError}
			</div>
		{:else if courses.length === 0}
			<EmptyState
				title="No courses created yet"
				description="Start by creating your first AI-powered course on any topic, or browse courses created by the community."
				actionLabel="+ Create New Course"
				onAction={() => goto('/app/courses/createCourse')}
				secondaryActionLabel="or browse a course someone else made"
				secondaryActionHref="/app/explore"
				suggestions={topicSuggestions}
				onSelectSuggestion={handleSelectSuggestion}
			/>
		{:else}
			{@const recentCourse = inProgressCourses[0] || courses[0]}
			{@const completedCount = recentCourse.progress?.completed ?? 0}
			{@const totalCount = recentCourse.moduleCount ?? 1}
			{@const pct = Math.min(100, Math.round((completedCount / totalCount) * 100))}

			<!-- Prominent Resume / Pick Up Where You Left Off Card -->
			<div
				class="relative overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-br from-primary-soft/40 via-surface to-surface p-6 shadow-md sm:p-8"
			>
				<div class="flex flex-col justify-between gap-6 md:flex-row md:items-center">
					<div class="flex max-w-2xl flex-col gap-2.5">
						<div
							class="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/30 bg-primary-soft/80 px-3 py-1 text-[10px] font-black tracking-wider text-primary uppercase"
						>
							<span>📍 Pick up where you left off</span>
						</div>
						<h3 class="font-display text-xl font-bold tracking-tight text-text sm:text-2xl">
							{recentCourse.title}
						</h3>
						<p class="line-clamp-2 text-xs leading-relaxed text-text-muted sm:text-sm">
							{recentCourse.description}
						</p>

						<!-- Progress Stats -->
						<div class="mt-2 flex flex-col gap-1.5">
							<div class="flex items-center justify-between text-xs font-bold">
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

					<div class="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row md:flex-col">
						<a
							href={`/app/courses/${recentCourse.id}`}
							class="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-xs font-bold text-white shadow-lg shadow-primary/25 transition-all duration-180 hover:scale-[1.02] hover:bg-primary-hover active:scale-95"
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
							class="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold text-text-muted hover:border-primary/40 hover:text-text"
						>
							<span>🔗 Share Course</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Item #15: Grouped Courses Sections -->
			{#if inProgressCourses.length > 0}
				<div class="flex flex-col gap-4 pt-4">
					<h3 class="font-display text-xs font-bold tracking-wider text-text-muted uppercase">
						In Progress Courses ({inProgressCourses.length})
					</h3>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
						{#each inProgressCourses as course (course.id)}
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
						{/each}
					</div>
				</div>
			{/if}

			{#if completedCourses.length > 0}
				<div class="flex flex-col gap-4 pt-4">
					<h3 class="font-display text-xs font-bold tracking-wider text-emerald-400 uppercase">
						🎓 Completed Courses & Certificates ({completedCourses.length})
					</h3>
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
						{#each completedCourses as course (course.id)}
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
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<ShareModal
	show={showShareModal}
	{shareUrl}
	courseTitle="Shared Course"
	onClose={() => (showShareModal = false)}
/>
