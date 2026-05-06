
// Bump version on every deployment to force cache refresh and prevent white screen
// caused by stale index.html referencing old (gone) asset hashes.
const CACHE_NAME = 'bahati-pro-1.0.13-866f61e';

self.addEventListener('install', (event) => {
  // Take control immediately so the updated SW starts serving right away.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Claim all open tabs so they use this new SW without a reload.
      self.clients.claim(),
      // Delete any stale caches from previous versions.
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});

// Allow the app to trigger skipWaiting on demand (e.g. from an update banner).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Always use the network for HTML navigation requests so that a fresh
  // index.html (with the correct asset hashes) is returned after each
  // Vercel deployment.  Fall back to cache only when offline.
  if (
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch((err) => {
          console.warn('[SW] Network request failed, falling back to cache:', err);
          return caches.match(event.request);
        })
    );
    return;
  }

  // For all other requests (assets, API calls) use cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
