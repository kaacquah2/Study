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
import { env } from '$env/dynamic/private';

const ML_BACKEND_URL = env.ML_BACKEND_URL || 'http://localhost:8000';
const ML_BACKEND_API_KEY = env.ML_BACKEND_API_KEY || '';

/** Build headers for forwarding requests to the Python ML backend */
function mlHeaders(userId?: string): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (ML_BACKEND_API_KEY) {
		headers['X-API-Key'] = ML_BACKEND_API_KEY;
	}
	if (userId) {
		headers['X-User-ID'] = userId;
	}
	return headers;
}

// ── GET /api/documents ─────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		const res = await fetch(`${ML_BACKEND_URL}/rag-stats`, {
			headers: mlHeaders(user.uid)
		});

		if (!res.ok) {
			const text = await res.text();
			return json({ error: { code: 'ML_ERROR', message: text } }, { status: 502 });
		}

		const data = await res.json();
		return json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};

// ── POST /api/documents ────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

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

		const res = await fetch(`${ML_BACKEND_URL}/documents`, {
			method: 'POST',
			headers: mlHeaders(user.uid),
			body: JSON.stringify({ texts: cleaned })
		});

		if (!res.ok) {
			const text = await res.text();
			return json({ error: { code: 'ML_ERROR', message: text } }, { status: 502 });
		}

		const data = await res.json();
		return json(data, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};

// ── DELETE /api/documents ──────────────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);

		const res = await fetch(`${ML_BACKEND_URL}/documents`, {
			method: 'DELETE',
			headers: mlHeaders(user.uid)
		});

		if (!res.ok) {
			const text = await res.text();
			return json({ error: { code: 'ML_ERROR', message: text } }, { status: 502 });
		}

		const data = await res.json();
		return json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
};
