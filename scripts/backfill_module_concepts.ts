/**
 * Standalone Migration Script: Canonical Concept Taxonomy Backfill
 *
 * Scans Firestore course modules that lack the `concepts` dictionary,
 * extracting canonical concept tags from module titles, summaries, and key points.
 *
 * Usage:
 *   npx tsx scripts/backfill_module_concepts.ts
 */

import { adminDb } from '../src/lib/server/admin';

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

async function runConceptBackfill() {
	console.log('Starting module canonical concept taxonomy backfill...');

	const coursesSnap = await adminDb.collection('courses').get();
	console.log(`Found ${coursesSnap.size} courses to inspect.`);

	let backfilledModuleCount = 0;

	for (const courseDoc of coursesSnap.docs) {
		const modulesSnap = await courseDoc.ref.collection('modules').get();

		for (const modDoc of modulesSnap.docs) {
			const modData = modDoc.data();

			if (!modData.concepts || !Array.isArray(modData.concepts) || modData.concepts.length === 0) {
				const concepts: Array<{ id: string; term: string; aliases: string[]; summary?: string }> = [];

				// 1. Primary module concept
				if (modData.title) {
					concepts.push({
						id: `concept_${slugify(modData.title)}`,
						term: modData.title,
						aliases: [modData.title.toLowerCase()],
						summary: modData.summary || ''
					});
				}

				// 2. Extract from keyPoints if available
				if (Array.isArray(modData.keyPoints)) {
					for (const kp of modData.keyPoints) {
						if (typeof kp === 'string' && kp.trim().length > 3) {
							const term = kp.split(':')[0].trim();
							const slug = `concept_${slugify(term)}`;
							if (!concepts.some((c) => c.id === slug)) {
								concepts.push({
									id: slug,
									term,
									aliases: [term.toLowerCase()],
									summary: kp
								});
							}
						}
					}
				}

				if (concepts.length > 0) {
					await modDoc.ref.update({
						concepts,
						conceptsBackfilledAt: new Date().toISOString()
					});
					backfilledModuleCount++;
				}
			}
		}
	}

	console.log(`Successfully backfilled concept taxonomies on ${backfilledModuleCount} modules.`);
}

runConceptBackfill().catch((err) => {
	console.error('Concept backfill failed:', err);
	process.exit(1);
});
