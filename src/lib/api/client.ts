import { auth } from '$lib/firebase/client';
import { themeStore } from '$lib/stores/theme.svelte';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export class ApiError extends Error {
	status: number;
	code?: string;
	extra?: unknown;

	constructor(message: string, status: number, code?: string, extra?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.extra = extra;
	}
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
	body?: unknown;
	skipAuth?: boolean;
	timeout?: number;
	responseType?: 'json' | 'stream' | 'blob' | 'text';
	raw?: boolean;
}

export interface ApiResponse<T = unknown> {
	data: T;
	status: number;
	ok: boolean;
	headers: Headers;
	raw?: Response;
}

function combineSignals(signals: (AbortSignal | null | undefined)[]): AbortSignal | undefined {
	const valid = signals.filter((s): s is AbortSignal => Boolean(s));
	if (valid.length === 0) return undefined;
	if (valid.length === 1) return valid[0];
	if (typeof AbortSignal.any === 'function') {
		return AbortSignal.any(valid);
	}
	const controller = new AbortController();
	for (const sig of valid) {
		if (sig.aborted) {
			controller.abort(sig.reason);
			return controller.signal;
		}
		sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
	}
	return controller.signal;
}

function handleApiError(res: Response, jsonResult: Record<string, unknown>): never {
	if (
		res.status === 401 &&
		browser &&
		typeof window !== 'undefined' &&
		window.location.pathname !== '/'
	) {
		const currentUrl = window.location.pathname + window.location.search;
		try {
			goto(`/?redirect=${encodeURIComponent(currentUrl)}`);
		} catch {
			window.location.href = `/?redirect=${encodeURIComponent(currentUrl)}`;
		}
	}

	const errObj = (jsonResult.error as Record<string, unknown> | undefined) || {};
	const errorMessage =
		(errObj.message as string | undefined) ||
		(jsonResult.message as string | undefined) ||
		(res.status === 401
			? 'Authentication required. Please sign in.'
			: res.status === 429
				? 'Too many requests. Please slow down and try again.'
				: res.status === 503 || errObj.code === 'MODEL_WARMING_UP'
					? 'AI models are currently warming up. Please try again shortly.'
					: `Request failed with status ${res.status}`);

	const errorCode =
		(errObj.code as string | undefined) ||
		(jsonResult.code as string | undefined) ||
		`HTTP_${res.status}`;
	throw new ApiError(errorMessage, res.status, errorCode, jsonResult);
}

/**
 * Standardized API client for all app network requests.
 * Automatically injects Auth token, theme, and timezone headers.
 * Standardizes status code, error handling, JSON parsing, timeout/cancellation, and 401 redirects.
 */
export async function apiFetch<T = unknown>(
	endpoint: string,
	options: ApiFetchOptions = {}
): Promise<ApiResponse<T>> {
	const {
		body,
		skipAuth = false,
		timeout = 60_000,
		responseType = 'json',
		raw = false,
		signal: customSignal,
		headers: customHeaders,
		...customInit
	} = options;

	const headers: Record<string, string> = {
		'X-Client-Theme': themeStore.current || 'dark',
		'X-Client-Timezone':
			typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
	};

	// Attach JSON content-type if body provided as object/array
	if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
		headers['Content-Type'] = 'application/json';
	} else if (body !== undefined && typeof body === 'string') {
		headers['Content-Type'] = 'application/json';
	}

	// Attach Firebase ID Token if authenticated
	if (!skipAuth && auth.currentUser) {
		try {
			const idToken = await auth.currentUser.getIdToken();
			headers['Authorization'] = `Bearer ${idToken}`;
		} catch (e) {
			console.warn('[apiFetch] Failed to retrieve Auth ID token:', e);
		}
	}

	// Merge custom headers
	if (customHeaders) {
		if (customHeaders instanceof Headers) {
			customHeaders.forEach((val, key) => {
				headers[key] = val;
			});
		} else if (Array.isArray(customHeaders)) {
			customHeaders.forEach(([key, val]) => {
				headers[key] = val;
			});
		} else {
			Object.assign(headers, customHeaders);
		}
	}

	const requestBody =
		body !== undefined
			? body instanceof FormData || typeof body === 'string'
				? (body as BodyInit)
				: JSON.stringify(body)
			: undefined;

	const timeoutSignal =
		timeout > 0 && typeof AbortSignal.timeout === 'function'
			? AbortSignal.timeout(timeout)
			: undefined;
	const signal = combineSignals([customSignal, timeoutSignal]);

	const res = await fetch(endpoint, {
		...customInit,
		headers,
		body: requestBody,
		signal
	});

	// Handle non-content status codes
	if (res.status === 204) {
		return {
			data: undefined as unknown as T,
			status: 204,
			ok: true,
			headers: res.headers,
			raw: res
		};
	}

	// Handle raw response or streaming
	if (raw || responseType === 'stream') {
		if (!res.ok) {
			let jsonResult: Record<string, unknown> = {};
			try {
				jsonResult = (await res.json()) as Record<string, unknown>;
			} catch {
				// Non-json response
			}
			handleApiError(res, jsonResult);
		}

		return {
			data: res.body as unknown as T,
			status: res.status,
			ok: res.ok,
			headers: res.headers,
			raw: res
		};
	}

	// Handle Blob responses
	if (responseType === 'blob') {
		if (!res.ok) {
			let jsonResult: Record<string, unknown> = {};
			try {
				jsonResult = (await res.json()) as Record<string, unknown>;
			} catch {
				// Non-json response
			}
			handleApiError(res, jsonResult);
		}

		const blobData = await res.blob();
		return {
			data: blobData as unknown as T,
			status: res.status,
			ok: res.ok,
			headers: res.headers,
			raw: res
		};
	}

	// Handle Text responses
	if (responseType === 'text') {
		if (!res.ok) {
			let jsonResult: Record<string, unknown> = {};
			try {
				jsonResult = (await res.json()) as Record<string, unknown>;
			} catch {
				// Non-json response
			}
			handleApiError(res, jsonResult);
		}

		const textData = await res.text();
		return {
			data: textData as unknown as T,
			status: res.status,
			ok: res.ok,
			headers: res.headers,
			raw: res
		};
	}

	// Standard JSON response
	let jsonResult: Record<string, unknown> = {};
	try {
		jsonResult = (await res.json()) as Record<string, unknown>;
	} catch {
		// Response body wasn't JSON
	}

	if (!res.ok) {
		handleApiError(res, jsonResult);
	}

	return {
		data: jsonResult as T,
		status: res.status,
		ok: res.ok,
		headers: res.headers,
		raw: res
	};
}
