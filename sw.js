// Простой сервис-воркер для PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Проксируем запросы без агрессивного кэширования, чтобы чат был свежим
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Не трогаем сторонние запросы
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
