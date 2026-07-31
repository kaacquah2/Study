const CACHE_NAME = 'study-buddy-pwa-v1';
const ASSETS = ['/', '/app', '/manifest.json', '/favicon.png'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(ASSETS);
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => {
			return Promise.all(
				keys.map((key) => {
					if (key !== CACHE_NAME) {
						return caches.delete(key);
					}
				})
			);
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);

	// Cache-first for static assets, stale-while-revalidate for navigation
	if (url.origin === self.location.origin) {
		// Network-only for authenticated API requests
		if (url.pathname.startsWith('/api/')) return;

		event.respondWith(
			caches.match(event.request).then((cached) => {
				const networked = fetch(event.request)
					.then((response) => {
						if (response && response.status === 200) {
							const cacheCopy = response.clone();
							caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
						}
						return response;
					})
					.catch(() => cached);

				return cached || networked;
			})
		);
	}
});
