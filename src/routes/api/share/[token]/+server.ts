import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { enforceRateLimit } from '$lib/server/rateLimiter';
import crypto from 'crypto';

// GET /api/share/[token]
export async function GET({ params, getClientAddress }) {
	const { token } = params;

	try {
		// Enforce IP-based rate limiting (100 requests per hour per IP)
		const rawIp = getClientAddress();
		const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');
		const ipLimitRef = adminDb.collection('ip_rate_limits').doc(ipHash);
		const hourStr = Math.floor(Date.now() / 3600000).toString();

		try {
			await enforceRateLimit(ipLimitRef, 100, hourStr, 'count', 'hour');
		} catch (rateErr) {
			if (rateErr instanceof Error && rateErr.message === 'RATE_LIMIT_EXCEEDED') {
				return json(
					{
						error: {
							code: 'RATE_LIMIT_EXCEEDED',
							message: 'Rate limit exceeded. Please try again later.'
						}
					},
					{ status: 429 }
				);
			}
			throw rateErr;
		}

		const shareDoc = await adminDb.collection('sharedCourses').doc(token).get();

		if (!shareDoc.exists) {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Shared course link not found' } },
				{ status: 404 }
			);
		}

		const shareData = shareDoc.data();
		if (!shareData) {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Shared course link not found' } },
				{ status: 404 }
			);
		}

		if (shareData.revoked) {
			return json(
				{ error: { code: 'REVOKED', message: 'This shared course link has been revoked' } },
				{ status: 410 }
			);
		}

		const snapshot = shareData.snapshot;
		return json({
			title: snapshot.title,
			description: snapshot.description,
			sharedByName: shareData.sharedByName,
			moduleCount: snapshot.modules.length
		});
	} catch (err) {
		console.error('Get shared course preview error:', err);
		const message = err instanceof Error ? err.message : 'Internal Server Error';
		return json({ error: { code: 'SERVER_ERROR', message } }, { status: 500 });
	}
}
