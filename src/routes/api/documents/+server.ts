import type { RequestHandler } from './$types';
/**
 * /api/documents — Secure proxy to the ML backend's RAG document endpoints.
 *
 * All requests are authenticated via Firebase session before being forwarded.
 * This prevents the ML backend from being called directly without auth.
 *
 * GET    /api/documents       → Returns RAG store stats (chunk count)
 * POST   /api/documents       → Adds texts to the vector store
 * DELETE /api/documents       → Clears the entire vector store
 */

import { json } from '@sveltejs/kit';
import { verifySessionUser } from '$lib/server/auth';
import { buildMLAuthHeaders } from '$lib/server/ai/client';
import { env } from '$env/dynamic/private';
import { handleServerError } from '$lib/server/apiError';

const ML_BACKEND_URL = env.ML_BACKEND_URL || 'http://127.0.0.1:8000';

// ── GET /api/documents ─────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
	const { request } = event;
	try {
		const user = await verifySessionUser(request);
		const requestId = event.locals?.requestId || crypto.randomUUID();

		const res = await fetch(`${ML_BACKEND_URL}/rag-stats`, {
			headers: buildMLAuthHeaders('{}', user.uid, requestId)
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(
				`[documents GET] ML backend error [req_id=${requestId}] (${res.status}):`,
				text
			);
			return json(
				{
					error: {
						code: 'ML_ERROR',
						message: 'ML backend service unavailable',
						requestId
					},
					requestId
				},
				{ status: 502, headers: { 'X-Request-ID': requestId } }
			);
		}

		const data = await res.json();
		return json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event);
	}
};

// ── POST /api/documents ────────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	try {
		const user = await verifySessionUser(request);
		const requestId = event.locals?.requestId || crypto.randomUUID();

		const body = await request.json();
		const texts: string[] = body?.texts;

		if (!Array.isArray(texts) || texts.length === 0) {
			return json(
				{
					error: { code: 'INVALID_INPUT', message: "'texts' must be a non-empty array of strings." }
				},
				{ status: 400 }
			);
		}

		// Validate each text entry
		const cleaned = texts
			.map((t) => (typeof t === 'string' ? t.trim() : ''))
			.filter((t) => t.length >= 20);

		if (cleaned.length === 0) {
			return json(
				{
					error: {
						code: 'INVALID_INPUT',
						message: 'All provided texts were too short (minimum 20 characters each).'
					}
				},
				{ status: 400 }
			);
		}

		const bodyString = JSON.stringify({ texts: cleaned });
		const res = await fetch(`${ML_BACKEND_URL}/documents`, {
			method: 'POST',
			headers: buildMLAuthHeaders(bodyString, user.uid, requestId),
			body: bodyString
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(
				`[documents POST] ML backend error [req_id=${requestId}] (${res.status}):`,
				text
			);
			return json(
				{
					error: {
						code: 'ML_ERROR',
						message: 'ML backend service unavailable',
						requestId
					},
					requestId
				},
				{ status: 502, headers: { 'X-Request-ID': requestId } }
			);
		}

		const data = await res.json();
		return json(data, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event);
	}
};

// ── DELETE /api/documents ──────────────────────────────────────────────────────

export const DELETE: RequestHandler = async (event) => {
	const { request } = event;
	try {
		const user = await verifySessionUser(request);
		const requestId = event.locals?.requestId || crypto.randomUUID();

		const res = await fetch(`${ML_BACKEND_URL}/documents`, {
			method: 'DELETE',
			headers: buildMLAuthHeaders('{}', user.uid, requestId)
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(
				`[documents DELETE] ML backend error [req_id=${requestId}] (${res.status}):`,
				text
			);
			return json(
				{
					error: {
						code: 'ML_ERROR',
						message: 'ML backend service unavailable',
						requestId
					},
					requestId
				},
				{ status: 502, headers: { 'X-Request-ID': requestId } }
			);
		}

		const data = await res.json();
		return json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
		}
		return handleServerError(err, event);
	}
};
