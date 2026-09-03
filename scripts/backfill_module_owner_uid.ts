/**
 * Standalone Migration Script: Module ownerUid Denormalization Backfill
 *
 * Scans all Firestore courses and their subcollection modules,
 * denormalizing `ownerUid` (and `courseId`) onto each module document
 * so security rules evaluate `resource.data.ownerUid` directly without billable get() calls.
 *
 * Usage:
 *   npx tsx scripts/backfill_module_owner_uid.ts
 */

import { adminDb } from '../src/lib/server/admin';

async function runBackfill() {
	console.log('Starting module ownerUid denormalization backfill...');

	const coursesSnap = await adminDb.collection('courses').get();
	console.log(`Found ${coursesSnap.size} courses to inspect.`);

	let totalModules = 0;
	let updatedModules = 0;

	for (const courseDoc of coursesSnap.docs) {
		const courseData = courseDoc.data();
		const ownerUid = courseData?.ownerUid;

		if (!ownerUid) {
			console.warn(`Course ${courseDoc.id} has no ownerUid. Skipping its modules.`);
			continue;
		}

		const modulesSnap = await courseDoc.ref.collection('modules').get();
		if (modulesSnap.empty) continue;

		totalModules += modulesSnap.size;

		let batch = adminDb.batch();
		let batchCount = 0;

		for (const modDoc of modulesSnap.docs) {
			const modData = modDoc.data();

			if (!modData.ownerUid || modData.ownerUid !== ownerUid || !modData.courseId) {
				batch.update(modDoc.ref, {
					ownerUid,
					courseId: courseDoc.id
				});
				batchCount++;
				updatedModules++;

				if (batchCount >= 400) {
					await batch.commit();
					batch = adminDb.batch();
					batchCount = 0;
				}
			}
		}

		if (batchCount > 0) {
			await batch.commit();
		}
	}

	console.log(
		`Backfill complete! Inspected ${totalModules} modules across ${coursesSnap.size} courses. Updated ${updatedModules} modules.`
	);
}

runBackfill().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
