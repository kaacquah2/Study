/**
 * Domain Classifier Calibration Script
 *
 * Evaluates token-Jaccard lexical overlap similarity against a labeled benchmark dataset
 * of CS-core vs Non-CS topics to calibrate the optimal lexical confidence threshold.
 *
 * Run with: npx tsx scripts/calibrate_domain_classifier.ts
 */

import { calculateDomainConfidence } from '../src/lib/server/ai/domainClassifier';

export const BENCHMARK_DATASET = [
	// CS Core Topics (Target: High Confidence / In-Domain)
	{ topic: 'Data Structures and Algorithms in C++', expectedInDomain: true },
	{ topic: 'Operating System Memory Management & Page Tables', expectedInDomain: true },
	{ topic: 'TCP/IP Protocol Suite and Socket Programming', expectedInDomain: true },
	{ topic: 'Relational Database Design and Normalization', expectedInDomain: true },
	{ topic: 'RISC vs CISC CPU Architecture', expectedInDomain: true },
	{ topic: 'Discrete Math: Propositional Logic & Graph Theory', expectedInDomain: true },
	{ topic: 'Object-Oriented Software Design Patterns', expectedInDomain: true },
	{ topic: 'Lexical Analysis and Parsing in Compiler Construction', expectedInDomain: true },
	{ topic: 'Public Key Cryptography and RSA Encryption', expectedInDomain: true },
	{ topic: 'Binary Search Trees and AVL Tree Rotations', expectedInDomain: true },
	{ topic: 'Deadlocks and Process Synchronization in Unix', expectedInDomain: true },
	{ topic: 'SQL Query Optimization and B-Tree Indexing', expectedInDomain: true },
	{ topic: 'Dijkstra Shortest Path Algorithm', expectedInDomain: true },
	{ topic: 'Assembly Language X86 Registers', expectedInDomain: true },
	{ topic: 'Computer Organization & Pipelining', expectedInDomain: true },

	// Non-CS / Out-of-Domain Topics (Target: Low Confidence / Out-of-Domain)
	{ topic: 'Principles of Digital Marketing and SEO', expectedInDomain: false },
	{ topic: 'Organic Chemistry: Reaction Mechanisms', expectedInDomain: false },
	{ topic: 'Macroeconomics and Fiscal Policy', expectedInDomain: false },
	{ topic: 'Modern European History 1914-1945', expectedInDomain: false },
	{ topic: 'Financial Accounting & Balance Sheet Auditing', expectedInDomain: false },
	{ topic: 'Introduction to Culinary Arts and Baking', expectedInDomain: false },
	{ topic: 'Cognitive Psychology and Human Memory', expectedInDomain: false },
	{ topic: 'Cell Biology and Genetics', expectedInDomain: false },
	{ topic: 'International Relations and Political Theory', expectedInDomain: false },
	{ topic: 'Architectural Drafting and Spatial Design', expectedInDomain: false },
	{ topic: 'Supply Chain Management and Logistics', expectedInDomain: false },
	{ topic: 'Environmental Science and Climate Change', expectedInDomain: false },
	{ topic: 'Kinesiology and Human Anatomy', expectedInDomain: false },
	{ topic: 'French Conversational Grammar', expectedInDomain: false },
	{ topic: 'Creative Writing: Narrative Arc and Pacing', expectedInDomain: false }
];

export function calibrateThreshold(threshold: number) {
	let truePositives = 0;
	let trueNegatives = 0;
	let falsePositives = 0;
	let falseNegatives = 0;

	for (const item of BENCHMARK_DATASET) {
		const { confidence } = calculateDomainConfidence(item.topic);
		const predictedInDomain = confidence >= threshold;

		if (predictedInDomain && item.expectedInDomain) truePositives++;
		else if (!predictedInDomain && !item.expectedInDomain) trueNegatives++;
		else if (predictedInDomain && !item.expectedInDomain) falsePositives++;
		else if (!predictedInDomain && item.expectedInDomain) falseNegatives++;
	}

	const accuracy = (truePositives + trueNegatives) / BENCHMARK_DATASET.length;
	const precision =
		truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
	const recall =
		truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
	const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

	return {
		threshold,
		accuracy,
		precision,
		recall,
		f1,
		truePositives,
		trueNegatives,
		falsePositives,
		falseNegatives
	};
}

if (process.argv[1]?.includes('calibrate_domain_classifier')) {
	console.log('=== Calibrating Domain Classifier Threshold ===\n');
	console.log('Threshold | Accuracy | Precision | Recall | F1 Score | TP | TN | FP | FN');
	console.log('-------------------------------------------------------------------------');

	for (let t = 0.2; t <= 0.8; t += 0.05) {
		const res = calibrateThreshold(Number(t.toFixed(2)));
		console.log(
			`${res.threshold.toFixed(2).padStart(9)} | ${(res.accuracy * 100).toFixed(1)}%     | ${(res.precision * 100).toFixed(1)}%      | ${(res.recall * 100).toFixed(1)}%   | ${res.f1.toFixed(3)}   | ${res.truePositives.toString().padStart(2)} | ${res.trueNegatives.toString().padStart(2)} | ${res.falsePositives.toString().padStart(2)} | ${res.falseNegatives.toString().padStart(2)}`
		);
	}
}
