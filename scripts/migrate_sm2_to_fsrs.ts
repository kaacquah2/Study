/**
 * Standalone Migration Script: SM-2 to FSRS-4.5
 *
 * Scans Firestore collections for flashcards created with legacy SM-2 fields
 * and converts them to standard FSRS-4.5 parameters (stability, difficulty, state).
 *
 * Usage:
 *   npx tsx scripts/migrate_sm2_to_fsrs.ts
 */

import { adminDb } from '../src/lib/server/admin';
import { convertSM2ToFSRS } from '../src/lib/server/fsrs';

async function runMigration() {
	console.log('Starting SM-2 to FSRS-4.5 migration...');

	const snapshot = await adminDb.collection('flashcards').get();
	console.log(`Found ${snapshot.size} total flashcard documents.`);

	let migratedCount = 0;
	let alreadyFSRSCount = 0;

	const batch = adminDb.batch();

	for (const doc of snapshot.docs) {
		const data = doc.data();

		// If card lacks FSRS stability or has legacy easeFactor
		if (data.stability === undefined || data.easeFactor !== undefined || data.engine === 'sm2') {
			const converted = convertSM2ToFSRS({
				easeFactor: data.easeFactor,
				intervalDays: data.intervalDays,
				repetitions: data.repetitions || data.reps,
				lapses: data.lapses
			});

			batch.update(doc.ref, {
				engine: 'fsrs',
				stability: converted.stability,
				difficulty: converted.difficulty,
				reps: converted.reps,
				lapses: converted.lapses,
				state: converted.state,
				migratedFromSM2: true,
				lastMigratedAt: new Date().toISOString()
			});

			migratedCount++;
		} else {
			alreadyFSRSCount++;
		}
	}

	if (migratedCount > 0) {
		await batch.commit();
		console.log(`Successfully migrated ${migratedCount} cards to FSRS-4.5.`);
	} else {
		console.log('No un-migrated SM-2 cards found.');
	}

	console.log(`Cards already in FSRS format: ${alreadyFSRSCount}`);
	console.log('Migration complete.');
}

runMigration().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
