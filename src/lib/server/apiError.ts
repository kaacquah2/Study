import { json } from '@sveltejs/kit';

export interface ServerErrorEventContext {
	locals?: { requestId?: string };
	request?: Request;
}

/**
 * Extract or generate a correlation request ID from locals, request headers, or a new UUID.
 */
export function getRequestId(contextOrId?: ServerErrorEventContext | string): string {
	if (typeof contextOrId === 'string' && contextOrId.trim()) {
		return contextOrId;
	}
	if (contextOrId && typeof contextOrId === 'object') {
		if (contextOrId.locals?.requestId) {
			return contextOrId.locals.requestId;
		}
		if (contextOrId.request) {
			const headerVal =
				contextOrId.request.headers.get('x-request-id') ||
				contextOrId.request.headers.get('x-correlation-id');
			if (headerVal) {
				return headerVal;
			}
		}
	}
	return crypto.randomUUID();
}

/**
 * Securely handle server-side errors without leaking internal system details:
 * - Logs raw exception and stack trace server-side with correlation ID.
 * - Returns a generic, safe client message along with the correlation ID.
 */
export function handleServerError(
	err: unknown,
	contextOrId?: ServerErrorEventContext | string,
	genericMessage = 'Internal Server Error',
	code = 'SERVER_ERROR'
) {
	const requestId = getRequestId(contextOrId);

	// Log complete error detail server-side along with the correlation ID
	console.error(`[${code}] [req_id=${requestId}]`, err);

	return json(
		{
			error: {
				code,
				message: genericMessage,
				requestId
			},
			requestId
		},
		{
			status: 500,
			headers: {
				'X-Request-ID': requestId
			}
		}
	);
}
