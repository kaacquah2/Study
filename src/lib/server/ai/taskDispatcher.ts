/**
 * Task Dispatcher — Cloud Tasks / Webhook / Local Worker Dispatcher
 *
 * Supports:
 * 1. Google Cloud Tasks HTTP enqueueing (for production serverless deployments)
 * 2. Dedicated Webhook Worker enqueueing
 * 3. Resilient In-Process Local Dispatcher (for dev, test, and standalone Node)
 */

export interface QueuedTaskPayload {
	jobId: string;
	jobType: 'outline' | 'module';
	courseId: string;
	moduleId?: string;
	userId: string;
}

export interface DispatchResult {
	dispatchedVia: 'cloud_tasks' | 'webhook' | 'local';
	success: boolean;
	taskId?: string;
	error?: string;
}

/**
 * Returns the configured internal worker authorization secret.
 */
export function getWorkerSecret(): string {
	const secret = process.env.INTERNAL_WORKER_SECRET;
	if (!secret) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error('[FATAL] INTERNAL_WORKER_SECRET is required in production.');
		}
		console.warn('[taskDispatcher] INTERNAL_WORKER_SECRET unset — worker endpoints disabled.');
		return '';
	}
	return secret;
}

/**
 * Dispatches a generation job to the appropriate worker system depending on environment.
 */
export async function dispatchGenerationTask(
	payload: QueuedTaskPayload,
	localHandler?: (payload: QueuedTaskPayload) => Promise<void>
): Promise<DispatchResult> {
	const workerUrl = process.env.WORKER_URL || process.env.PUBLIC_APP_URL;
	const gcpProject = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
	const gcpLocation = process.env.CLOUD_TASKS_LOCATION;
	const gcpQueue = process.env.CLOUD_TASKS_QUEUE_NAME;

	// Mode 1: Cloud Tasks REST Dispatch (if fully configured in production)
	if (gcpProject && gcpLocation && gcpQueue && workerUrl) {
		try {
			const targetUrl = `${workerUrl.replace(/\/$/, '')}/api/internal/worker/process-job`;
			const endpoint = `https://cloudtasks.googleapis.com/v2/projects/${gcpProject}/locations/${gcpLocation}/queues/${gcpQueue}/tasks`;

			const body = {
				task: {
					httpRequest: {
						httpMethod: 'POST',
						url: targetUrl,
						headers: {
							'Content-Type': 'application/json',
							'X-Worker-Secret': getWorkerSecret()
						},
						body: Buffer.from(JSON.stringify(payload)).toString('base64')
					}
				}
			};

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body)
			});

			if (response.ok) {
				const data = await response.json();
				return {
					dispatchedVia: 'cloud_tasks',
					success: true,
					taskId: data.name
				};
			} else {
				console.warn(
					`[TaskDispatcher] Cloud Tasks dispatch failed (${response.status}), falling back to webhook/local:`,
					await response.text().catch(() => '')
				);
			}
		} catch (err) {
			console.warn(
				'[TaskDispatcher] Cloud Tasks dispatch error, falling back to local handler:',
				err
			);
		}
	}

	// Mode 2: Direct Webhook Worker Dispatch (if WORKER_URL is configured without Cloud Tasks)
	if (workerUrl && process.env.NODE_ENV === 'production' && !process.env.USE_LOCAL_WORKER) {
		try {
			const targetUrl = `${workerUrl.replace(/\/$/, '')}/api/internal/worker/process-job`;
			const response = await fetch(targetUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': getWorkerSecret()
				},
				body: JSON.stringify(payload)
			});

			if (response.ok) {
				return {
					dispatchedVia: 'webhook',
					success: true
				};
			}
		} catch (err) {
			console.warn(
				'[TaskDispatcher] Webhook worker dispatch failed, executing via local handler:',
				err
			);
		}
	}

	// Mode 3: Resilient Local / In-Process Execution (Dev, CI, or Fallback)
	if (localHandler) {
		// Non-blocking invocation
		setTimeout(() => {
			localHandler(payload).catch((e) =>
				console.error(`[TaskDispatcher] Local execution error for ${payload.jobId}:`, e)
			);
		}, 100);

		return {
			dispatchedVia: 'local',
			success: true
		};
	}

	return {
		dispatchedVia: 'local',
		success: false,
		error: 'No valid dispatcher or local handler available'
	};
}
