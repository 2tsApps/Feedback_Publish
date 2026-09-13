self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalace');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Aktivace');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.mode === 'navigate') {
    return;
  }

  const cacheableDestinations = new Set(['style', 'script', 'image', 'font']);
  if (!cacheableDestinations.has(event.request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
