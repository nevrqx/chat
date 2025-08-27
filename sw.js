// PWA Service Worker with runtime caching for faster loads
const STATIC_CACHE = 'static-v1';
const RUNTIME_CACHE = 'runtime-v1';
const IMAGE_CACHE = 'images-v1';

const CORE_FILES = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(CORE_FILES);
    } catch {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

function isSupabase(url) {
  return /supabase\.co/.test(url.host);
}

function isImageRequest(req) {
  return req.destination === 'image' || /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(new URL(req.url).pathname);
}

// Stale-while-revalidate helper
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || networkPromise || fetch(req).catch(() => cached);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;

  // Do not cache Supabase API/WebSocket
  if (isSupabase(url)) return;

  // Cross-origin images (e.g., avatars) — SWR
  if (url.origin !== self.location.origin && isImageRequest(req)) {
    event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE));
    return;
  }

  // Same-origin navigation — cache-first app shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match('./index.html');
      try {
        const net = await fetch(req);
        return net.ok ? net : (cached || net);
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Static assets — SWR
  if (url.origin === self.location.origin) {
    if (isImageRequest(req)) {
      event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE));
      return;
    }
    if (/\.(js|css|json)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
      return;
    }
  }

  // Fallback to network, then cache
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch {
      const cache = await caches.open(RUNTIME_CACHE);
      const match = await cache.match(req);
      return match || Response.error();
    }
  })());
});
