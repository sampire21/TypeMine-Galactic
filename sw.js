const CACHE_VERSION = 'v2';
const APP_CACHE = `sampire-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sampire-runtime-${CACHE_VERSION}`;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/Favicon.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

async function networkFirst(request, isNavigation) {
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) runtime.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await runtime.match(request);
    if (cached) return cached;
    // Only navigations may fall back to the app shell; never scripts, images or audio.
    if (isNavigation) {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  event.respondWith(networkFirst(request, isNavigation));
});
