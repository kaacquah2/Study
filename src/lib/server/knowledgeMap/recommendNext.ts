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

export interface RecommendationResult {
	node: ConceptNode;
	reason: string;
}

/**
 * Recommends the single best node/module to study next based on graph topology and FSRS mastery metrics.
 */
export function getRecommendedNext(
	nodes: ConceptNode[],
	edges: PrerequisiteEdge[],
	masteryMap: Map<string, ModuleMastery>
): RecommendationResult | null {
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
				fsrsState: 'not-started'
			}
		);
	};

	// Map nodes by ID and build adjacency lists
	const incomingPrereqs = new Map<string, string[]>(); // targetId -> Array of sourceId
	for (const edge of edges) {
		if (edge.relationship === 'prerequisite') {
			const list = incomingPrereqs.get(edge.target) || [];
			list.push(edge.source);
			incomingPrereqs.set(edge.target, list);
		}
	}

	const nodeMap = new Map<string, ConceptNode>();
	nodes.forEach((n) => nodeMap.set(n.id, n));

	// Filter out nodes belonging to 'not-assessed' modules (lesson-only)
	const assessableNodes = nodes.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.fsrsState !== 'not-assessed';
	});

	const targetPool = assessableNodes.length > 0 ? assessableNodes : nodes;

	// Check for Cold Start (no module has been reviewed yet)
	const hasAnyReviews = Array.from(masteryMap.values()).some((m) => m.questionsReviewed > 0);

	if (!hasAnyReviews) {
		// Cold start: find root node with no incoming prerequisites
		const rootNode =
			targetPool.find((n) => {
				const prereqs = incomingPrereqs.get(n.id) || [];
				return prereqs.length === 0;
			}) || targetPool[0];

		const moduleLabel = rootNode.moduleTitle ? `"${rootNode.moduleTitle}"` : `Module`;
		return {
			node: rootNode,
			reason: `This is the foundational topic in ${moduleLabel} — start here with no prerequisites required.`
		};
	}

	// Unmastered nodes pool (< 80% mastery)
	const unmasteredNodes = targetPool.filter((n) => {
		const m = getMastery(n.moduleId);
		return m.masteryPercent < 80;
	});

	// Case 1: All assessable modules are mastered (>= 80%)
	if (unmasteredNodes.length === 0) {
		// Pick the node with lowest average stability to maintain retention
		let lowestStabilityNode = targetPool[0];
		let minStability = Infinity;

		for (const n of targetPool) {
			const m = getMastery(n.moduleId);
			if (m.averageStability < minStability) {
				minStability = m.averageStability;
				lowestStabilityNode = n;
			}
		}

		const moduleLabel = lowestStabilityNode.moduleTitle
			? `"${lowestStabilityNode.moduleTitle}"`
			: `Module`;
		return {
			node: lowestStabilityNode,
			reason: `All modules are currently mastered! Review ${moduleLabel} to strengthen long-term memory retention.`
		};
	}

	// Score candidates based on prerequisite readiness, due questions, and importance
	let bestNode: ConceptNode | null = null;
	let maxScore = -Infinity;
	let bestReason = '';

	for (const candidate of unmasteredNodes) {
		const m = getMastery(candidate.moduleId);
		const prereqs = incomingPrereqs.get(candidate.id) || [];

		// Check if prerequisite modules are mastered (>= 80%)
		const prereqsMastered = prereqs.every((pId) => {
			const pNode = nodeMap.get(pId);
			if (!pNode) return true;
			const pMastery = getMastery(pNode.moduleId);
			return pMastery.masteryPercent >= 80 || pMastery.fsrsState === 'not-assessed';
		});

		let score = 0;
		if (prereqsMastered) score += 100;
		if (m.questionsDue > 0) score += 50 + m.questionsDue * 5;
		score += candidate.importance;
		score -= m.masteryPercent * 0.5; // Prioritize lower mastery %

		if (score > maxScore) {
			maxScore = score;
			bestNode = candidate;

			const moduleName = candidate.moduleTitle ? `"${candidate.moduleTitle}"` : `Module`;
			if (prereqsMastered) {
				bestReason = `Prerequisites for ${moduleName} are mastered. This module has ${m.questionsDue} question(s) due and ${m.masteryPercent}% module mastery.`;
			} else {
				bestReason = `Recommended for ${moduleName} based on active study queue (${m.questionsDue} questions due, ${m.masteryPercent}% module mastery).`;
			}
		}
	}

	if (!bestNode) {
		return null;
	}

	return {
		node: bestNode,
		reason: bestReason
	};
}
