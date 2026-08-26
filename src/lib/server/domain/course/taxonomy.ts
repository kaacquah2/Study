import crypto from 'node:crypto';

export interface CanonicalConcept {
	id: string;
	term: string;
	aliases: string[];
	summary?: string;
}

export interface ProvisionalConcept {
	id: string;
	term: string;
	createdAt: number;
}

export interface ConceptResolutionResult {
	conceptId: string;
	matchedTerm: string;
	confidence: number;
	isProvisional: boolean;
	matchStage: 'exact_alias' | 'token_jaccard' | 'embedding_cosine' | 'provisional_cosine' | 'minted_provisional';
}

function normalizeString(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(text: string): Set<string> {
	const words = normalizeString(text).split(' ').filter(Boolean);
	return new Set(words);
}

export function computeTokenJaccard(a: string, b: string): number {
	const setA = tokenize(a);
	const setB = tokenize(b);

	if (setA.size === 0 || setB.size === 0) return 0;

	let intersectionCount = 0;
	for (const token of setA) {
		if (setB.has(token)) {
			intersectionCount++;
		}
	}

	const unionCount = new Set([...setA, ...setB]).size;
	const jaccard = unionCount === 0 ? 0 : intersectionCount / unionCount;

	// When all tokens of the target concept are contained in the input highlight
	const containment = intersectionCount / setB.size;
	const containmentBonus = containment >= 1.0 ? 0.75 : containment * 0.6;

	return Math.max(jaccard, containmentBonus);
}


/**
 * Calculates cosine similarity between two float vector embeddings.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
	if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dot += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Generates a deterministic flashcard deduplication key.
 */
export function generateCardDedupKey(courseId: string, moduleId: string, conceptId: string): string {
	return `${courseId}:${moduleId}:${conceptId}`;
}

/**
 * 5-Stage Dual-Loop Canonical Concept Taxonomy Resolver.
 * Resolves highlighted student text or quiz miss terms against canonical module concepts,
 * then checks existing provisional concepts before minting a new one to guarantee zero card duplication.
 */
export function resolveConceptTaxonomy(params: {
	inputText: string;
	canonicalConcepts: CanonicalConcept[];
	existingProvisionalConcepts?: ProvisionalConcept[];
	conceptEmbeddings?: Map<string, number[]>;
	inputEmbedding?: number[];
}): ConceptResolutionResult {
	const {
		inputText,
		canonicalConcepts = [],
		existingProvisionalConcepts = [],
		conceptEmbeddings,
		inputEmbedding
	} = params;

	const normalizedInput = normalizeString(inputText);
	if (!normalizedInput) {
		return {
			conceptId: 'concept_general',
			matchedTerm: 'General Concept',
			confidence: 1.0,
			isProvisional: false,
			matchStage: 'exact_alias'
		};
	}

	// ── Stage 1: Exact Term or Alias Match ──────────────────────────────────────
	for (const concept of canonicalConcepts) {
		const normTerm = normalizeString(concept.term);
		if (normTerm === normalizedInput) {
			return {
				conceptId: concept.id,
				matchedTerm: concept.term,
				confidence: 1.0,
				isProvisional: false,
				matchStage: 'exact_alias'
			};
		}
		for (const alias of concept.aliases || []) {
			if (normalizeString(alias) === normalizedInput) {
				return {
					conceptId: concept.id,
					matchedTerm: concept.term,
					confidence: 1.0,
					isProvisional: false,
					matchStage: 'exact_alias'
				};
			}
		}
	}

	// ── Stage 2: Token Jaccard Overlap (Threshold >= 0.65) ─────────────────────
	let bestJaccardScore = 0;
	let bestJaccardConcept: CanonicalConcept | null = null;

	for (const concept of canonicalConcepts) {
		const termScore = computeTokenJaccard(normalizedInput, concept.term);
		if (termScore > bestJaccardScore) {
			bestJaccardScore = termScore;
			bestJaccardConcept = concept;
		}
		for (const alias of concept.aliases || []) {
			const aliasScore = computeTokenJaccard(normalizedInput, alias);
			if (aliasScore > bestJaccardScore) {
				bestJaccardScore = aliasScore;
				bestJaccardConcept = concept;
			}
		}
	}

	if (bestJaccardConcept && bestJaccardScore >= 0.65) {
		return {
			conceptId: bestJaccardConcept.id,
			matchedTerm: bestJaccardConcept.term,
			confidence: Math.round(bestJaccardScore * 100) / 100,
			isProvisional: false,
			matchStage: 'token_jaccard'
		};
	}

	// ── Stage 3: Canonical Embedding Cosine Similarity (Threshold > 0.82) ──────
	if (inputEmbedding && conceptEmbeddings) {
		let bestCosineScore = 0;
		let bestCosineConcept: CanonicalConcept | null = null;

		for (const concept of canonicalConcepts) {
			const vec = conceptEmbeddings.get(concept.id);
			if (vec) {
				const sim = computeCosineSimilarity(inputEmbedding, vec);
				if (sim > bestCosineScore) {
					bestCosineScore = sim;
					bestCosineConcept = concept;
				}
			}
		}

		if (bestCosineConcept && bestCosineScore > 0.82) {
			return {
				conceptId: bestCosineConcept.id,
				matchedTerm: bestCosineConcept.term,
				confidence: Math.round(bestCosineScore * 100) / 100,
				isProvisional: false,
				matchStage: 'embedding_cosine'
			};
		}
	}

	// ── Stage 4: Existing Provisional Concepts Loop (Anti-Duplication Gate) ────
	let bestProvisionalScore = 0;
	let bestProvisional: ProvisionalConcept | null = null;

	for (const prov of existingProvisionalConcepts) {
		const jaccard = computeTokenJaccard(normalizedInput, prov.term);
		if (jaccard > bestProvisionalScore) {
			bestProvisionalScore = jaccard;
			bestProvisional = prov;
		}

		if (inputEmbedding && conceptEmbeddings) {
			const vec = conceptEmbeddings.get(prov.id);
			if (vec) {
				const cosSim = computeCosineSimilarity(inputEmbedding, vec);
				if (cosSim > bestProvisionalScore) {
					bestProvisionalScore = cosSim;
					bestProvisional = prov;
				}
			}
		}
	}

	if (bestProvisional && bestProvisionalScore >= 0.65) {
		return {
			conceptId: bestProvisional.id,
			matchedTerm: bestProvisional.term,
			confidence: Math.round(bestProvisionalScore * 100) / 100,
			isProvisional: true,
			matchStage: 'provisional_cosine'
		};
	}

	// ── Stage 5: Mint New Module-Scoped Provisional Concept ───────────────────
	const hash = crypto.createHash('sha256').update(normalizedInput).digest('hex').slice(0, 10);
	const newConceptId = `concept_custom_${hash}`;

	return {
		conceptId: newConceptId,
		matchedTerm: inputText.slice(0, 80).trim(),
		confidence: 0.5,
		isProvisional: true,
		matchStage: 'minted_provisional'
	};
}
