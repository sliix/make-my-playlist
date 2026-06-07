const CACHE_NAME = 'makemyplaylist-v29';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/icon.svg',
        '/manifest.json'
      ]);
    })
  );
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
  e.waitUntil(
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
});

self.addEventListener('fetch', (e) => {
  // Ignore API requests, external requests, and the service worker file itself
  if (
    e.request.url.includes('/api/') || 
    e.request.url.includes('/sw.js') || 
    !e.request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Network-First (with cache fallback) strategy to ensure new versions load immediately
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Cache newly fetched assets dynamically
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network is unavailable (offline)
        return caches.match(e.request);
      })
  );
});
