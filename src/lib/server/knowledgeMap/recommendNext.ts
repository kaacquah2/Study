import type { ModuleMastery } from './masteryCalculator';

export interface ConceptNode {
	id: string;
	label: string;
	moduleId: string;
	moduleTitle?: string;
	importance: number;
}

export interface PrerequisiteEdge {
	source: string;
	target: string;
	relationship: 'prerequisite' | 'related';
	confidence: number;
}

export type RecommendationType =
	| 'review'
	| 'review_mistakes'
	| 'practice_weak'
	| 'continue_learning'
	| 'explore';

export interface LearningRecommendation {
	type: RecommendationType;
	priority: number; // 1 (Highest) to 5 (Lowest)
	node: ConceptNode;
	moduleId: string;
	moduleTitle: string;
	reason: string;
	evidence: string[];
	actionLabel: string;
	actionUrl: string;
}

// Backward compatibility alias
export type RecommendationResult = {
	node: ConceptNode;
	reason: string;
	recommendation?: LearningRecommendation;
};

/**
 * Recommends the single best node/module to study next based on graph topology,
 * prerequisite dependencies, FSRS review urgency, and active knowledge gaps.
 */
export function getRecommendedNext(
	nodes: ConceptNode[],
	edges: PrerequisiteEdge[],
	masteryMap: Map<string, ModuleMastery>,
	courseId: string = ''
): LearningRecommendation | null {
	if (!nodes || nodes.length === 0) {
		return null;
	}

	// Helper to get module mastery
	const getMastery = (modId: string): ModuleMastery => {
		return (
			masteryMap.get(modId) || {
				moduleId: modId,
				masteryPercent: 0,
				questionsTotal: 0,
				questionsReviewed: 0,
				questionsDue: 0,
				averageStability: 0,
				fsrsState: 'not-started',
				masteryBreakdown: {
					quizAccuracy: 0,
					fsrsPerformance: 0,
					recencyScore: 0,
					lessonCompletion: 0
				},
				evidenceCount: 0,
				confidenceLevel: 'none'
			}
		);
	};

	// Map nodes by ID and build adjacency lists
	const incomingPrereqs = new Map<string, string[]>();
	for (const edge of edges) {
		if (edge.relationship === 'prerequisite') {
			const list = incomingPrereqs.get(edge.target) || [];
			list.push(edge.source);
			incomingPrereqs.set(edge.target, list);
		}
	}

	const nodeMap = new Map<string, ConceptNode>();
	nodes.forEach((n) => nodeMap.set(n.id, n));

	const assessableNodes = nodes.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.fsrsState !== 'not-assessed';
	});

	const targetPool = assessableNodes.length > 0 ? assessableNodes : nodes;

	// Cold start check: no module has any reviews yet
	const hasAnyReviews = Array.from(masteryMap.values()).some((m) => m.questionsReviewed > 0);

	if (!hasAnyReviews) {
		const rootNode =
			targetPool.find((n) => {
				const prereqs = incomingPrereqs.get(n.id) || [];
				return prereqs.length === 0;
			}) || targetPool[0];

		const moduleLabel = rootNode.moduleTitle || 'Foundational Module';
		return {
			type: 'continue_learning',
			priority: 4,
			node: rootNode,
			moduleId: rootNode.moduleId,
			moduleTitle: moduleLabel,
			reason: `This is the foundational topic in "${moduleLabel}" — start here with no prerequisites required.`,
			evidence: ['No previous study reviews recorded for this course', 'Root module in knowledge graph'],
			actionLabel: 'Start First Lesson',
			actionUrl: courseId ? `/app/courses/${courseId}/modules/${rootNode.moduleId}` : `/app/courses`
		};
	}

	// Priority 1: Check for urgent FSRS due reviews (questionsDue > 0)
	const nodesWithDueReviews = targetPool.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.questionsDue > 0;
	});

	if (nodesWithDueReviews.length > 0) {
		// Pick the one with the highest number of due reviews or lowest stability
		const dueNode = nodesWithDueReviews.sort((a, b) => {
			const ma = getMastery(a.moduleId);
			const mb = getMastery(b.moduleId);
			return mb.questionsDue - ma.questionsDue;
		})[0];

		const m = getMastery(dueNode.moduleId);
		const title = dueNode.moduleTitle || 'Module Review';

		return {
			type: 'review',
			priority: 1,
			node: dueNode,
			moduleId: dueNode.moduleId,
			moduleTitle: title,
			reason: `You have ${m.questionsDue} spaced repetition question(s) due for review in "${title}".`,
			evidence: [
				`${m.questionsDue} question(s) scheduled for review today`,
				`Current retention stability: ${m.averageStability} days`
			],
			actionLabel: 'Review Flashcards',
			actionUrl: `/app/review?moduleId=${dueNode.moduleId}`
		};
	}

	// Priority 3: Check for weak concepts (accuracy < 50% or low mastery)
	const weakNodes = targetPool.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.masteryPercent > 0 && m.masteryPercent < 50;
	});

	if (weakNodes.length > 0) {
		const weakNode = weakNodes.sort((a, b) => {
			const ma = getMastery(a.moduleId);
			const mb = getMastery(b.moduleId);
			return ma.masteryPercent - mb.masteryPercent;
		})[0];

		const m = getMastery(weakNode.moduleId);
		const title = weakNode.moduleTitle || 'Weak Area';

		return {
			type: 'practice_weak',
			priority: 3,
			node: weakNode,
			moduleId: weakNode.moduleId,
			moduleTitle: title,
			reason: `Your estimated mastery in "${title}" is ${m.masteryPercent}%. Targeted practice is recommended.`,
			evidence: [
				`Current mastery score: ${m.masteryPercent}% (${m.confidenceLevel} confidence)`,
				`Active recall accuracy: ${m.masteryBreakdown.quizAccuracy}%`
			],
			actionLabel: 'Practice Weak Concept',
			actionUrl: courseId ? `/app/courses/${courseId}/modules/${weakNode.moduleId}` : `/app/courses`
		};
	}

	// Priority 4: Find next unmastered module with prerequisites mastered
	const unmasteredNodes = targetPool.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.masteryPercent < 80;
	});

	if (unmasteredNodes.length > 0) {
		let bestNode: ConceptNode | null = null;
		let maxScore = -Infinity;
		let bestEvidence: string[] = [];

		for (const candidate of unmasteredNodes) {
			const m = getMastery(candidate.moduleId);
			const prereqs = incomingPrereqs.get(candidate.id) || [];

			const prereqsMastered = prereqs.every((pId) => {
				const pNode = nodeMap.get(pId);
				if (!pNode) return true;
				const pMastery = getMastery(pNode.moduleId);
				return pMastery.masteryPercent >= 80 || pMastery.fsrsState === 'not-assessed';
			});

			let score = 0;
			if (prereqsMastered) score += 100;
			score += candidate.importance;
			score -= m.masteryPercent * 0.5;

			if (score > maxScore) {
				maxScore = score;
				bestNode = candidate;
				bestEvidence = prereqsMastered
					? ['Prerequisite topics are mastered (>= 80%)', `Current module progress: ${m.masteryPercent}%`]
					: [`Active study queue node`, `Current module progress: ${m.masteryPercent}%`];
			}
		}

		if (bestNode) {
			const title = bestNode.moduleTitle || 'Next Topic';
			return {
				type: 'continue_learning',
				priority: 4,
				node: bestNode,
				moduleId: bestNode.moduleId,
				moduleTitle: title,
				reason: `Ready to progress: Prerequisites for "${title}" are satisfied.`,
				evidence: bestEvidence,
				actionLabel: 'Continue Learning',
				actionUrl: courseId ? `/app/courses/${courseId}/modules/${bestNode.moduleId}` : `/app/courses`
			};
		}
	}

	// Priority 5: All modules mastered (>= 80%) -> Recommend maintaining lowest stability node
	let lowestStabilityNode = targetPool[0];
	let minStability = Infinity;

	for (const n of targetPool) {
		const m = getMastery(n.moduleId);
		if (m.averageStability < minStability) {
			minStability = m.averageStability;
			lowestStabilityNode = n;
		}
	}

	const title = lowestStabilityNode.moduleTitle || 'Mastered Topic';
	return {
		type: 'explore',
		priority: 5,
		node: lowestStabilityNode,
		moduleId: lowestStabilityNode.moduleId,
		moduleTitle: title,
		reason: `All modules in this course are mastered! Review "${title}" to reinforce long-term memory.`,
		evidence: [
			'All course prerequisites and topics have >= 80% mastery',
			`Lowest memory stability topic (${minStability} days)`
		],
		actionLabel: 'Reinforce Memory',
		actionUrl: `/app/review?moduleId=${lowestStabilityNode.moduleId}`
	};
}
