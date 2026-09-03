/**
 * Netlify Scheduled Function: Reconcile Stalled Generation Jobs
 * Runs every 5 minutes to reclaim orphaned or stalled course/module generation jobs.
 */
export default async (): Promise<Response> => {
	const workerUrl =
		process.env.WORKER_URL ||
		process.env.URL ||
		process.env.DEPLOY_PRIME_URL ||
		'http://localhost:8888';
	const workerSecret = process.env.INTERNAL_WORKER_SECRET;

	if (!workerSecret) {
		console.warn('[reconcile-stalled-jobs] INTERNAL_WORKER_SECRET is not configured; skipping.');
		return new Response(JSON.stringify({ status: 'skipped', reason: 'Worker secret unset' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const endpoint = `${workerUrl.replace(/\/$/, '')}/api/internal/worker/reconcile`;
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Worker-Secret': workerSecret
			}
		});

		const body = await res.json().catch(() => ({}));
		console.log(`[reconcile-stalled-jobs] Triggered (${res.status}):`, body);

		return new Response(JSON.stringify({ status: 'ok', statusCode: res.status, result: body }), {
			status: res.ok ? 200 : res.status,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('[reconcile-stalled-jobs] Failed to trigger reconciliation endpoint:', err);
		return new Response(
			JSON.stringify({ error: 'Failed to trigger reconciliation', message: String(err) }),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

export const config = {
	schedule: '@every 5m'
};
