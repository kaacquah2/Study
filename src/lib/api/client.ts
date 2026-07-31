import { auth } from '$lib/firebase/client';
import { themeStore } from '$lib/stores/theme.svelte';

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
}

export interface ApiResponse<T = unknown> {
	data?: T;
	status: number;
	ok: boolean;
	[key: string]: unknown;
}

/**
 * Standardized API client for all app network requests.
 * Automatically injects Auth token, theme, and timezone headers.
 * Standardizes status code, error handling, and JSON parsing.
 */
export async function apiFetch<T = unknown>(
	endpoint: string,
	options: ApiFetchOptions = {}
): Promise<T> {
	const { body, skipAuth = false, headers: customHeaders, ...customInit } = options;

	const headers: Record<string, string> = {
		'X-Client-Theme': themeStore.current || 'dark',
		'X-Client-Timezone':
			typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
	};

	// Attach JSON content-type if body provided as object/array
	if (body !== undefined && !(body instanceof FormData)) {
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

	const res = await fetch(endpoint, {
		...customInit,
		headers,
		body: requestBody
	});

	// Handle non-content status codes
	if (res.status === 204) {
		return { status: 204, ok: true } as unknown as T;
	}

	let jsonResult: Record<string, unknown> = {};
	try {
		jsonResult = (await res.json()) as Record<string, unknown>;
	} catch {
		// Response body wasn't JSON
	}

	if (!res.ok) {
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

	// Attach status code metadata if returning an object result
	if (typeof jsonResult === 'object' && jsonResult !== null && !Array.isArray(jsonResult)) {
		jsonResult._status = res.status;
	}

	return jsonResult as T;
}
