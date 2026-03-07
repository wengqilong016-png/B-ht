
// ── Bahati Jackpots PWA Service Worker ──────────────────────────────────────
// Strategy:
//   Navigation (HTML)   → Network-first → fallback to cached shell
//   Vite assets (hash)  → Cache-first  → update in background
//   API / Supabase      → Network-only (never cache)
//   Everything else     → Stale-while-revalidate

const SHELL_CACHE  = 'bahati-shell-v4';
const ASSET_CACHE  = 'bahati-assets-v4';

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// ── Install: precache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS).catch((err) => {
        console.warn('[SW] Shell precache failed (ok in dev):', err);
      });
    })
  );
});

// ── Activate: delete stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip: non-http, chrome-extension
  if (!url.protocol.startsWith('http')) return;

  // Skip: Supabase, Google APIs, analytics – always network-only
  const networkOnly = [
    'supabase.co',
    'googleapis.com',
    'maps.googleapis.com',
    'vercel.com',
    'va.vercel-insights.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  if (networkOnly.some((h) => url.hostname.includes(h))) return;

  // HTML navigation → Network-first with offline shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html', { cacheName: SHELL_CACHE });
          return cached || caches.match('./', { cacheName: SHELL_CACHE });
        })
    );
    return;
  }

  // Vite-hashed assets (js/css/img with content hash) → Cache-first
  if (url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)(\?.*)?$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // manifest.json → Cache-first (also part of shell)
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Default → Stale-while-revalidate
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
// When the device reconnects, Chrome/Edge fires a 'sync' event.
// We broadcast a message so the React app flushes the IndexedDB queue.
self.addEventListener('sync', (event) => {
  if (event.tag === 'bahati-flush-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((client) => {
            try {
              client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' });
            } catch (err) {
              console.warn('[SW] postMessage failed for client:', err);
            }
          });
        })
        .catch((err) => {
          console.warn('[SW] clients.matchAll failed during sync:', err);
        })
    );
  }
});

// ── Push (future use) ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Bahati Jackpots', {
      body: data.body || '',
      icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    })
  );
});
