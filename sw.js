const CACHE_VERSION = 'v3';
const APP_CACHE = `sampire-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sampire-runtime-${CACHE_VERSION}`;
// Small shell only. The favicon, logo and audio are fetched on demand.
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page shows an "update available" toast and asks for it.
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
    const cached = await runtime.match(request) || await caches.match(request);
    if (cached) return cached;
    // Only navigations may fall back to the app shell; never scripts, images or audio.
    if (isNavigation) {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const runtime = await caches.open(RUNTIME_CACHE);
  const response = await fetch(request);
  if (response && response.ok) runtime.put(request, response.clone());
  return response;
}

// Key-sound packs live in a sub-folder of /Sound Effects/ (e.g. /Sound Effects/nk-cream/a.wav).
// Those are small and reused on every keystroke, so they may be cached. The theme
// music and one-shot effects at the top level are never cached by the worker.
function isKeySoundPackFile(pathname) {
  return /^\/Sound%20Effects\/[^/]+\/[^/]+$/.test(pathname) || /^\/Sound Effects\/[^/]+\/[^/]+$/.test(decodeURIComponent(pathname));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return; // media range requests go straight to the network

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = decodeURIComponent(url.pathname);

  if (path.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (path.startsWith('/Sound Effects/')) {
    if (isKeySoundPackFile(url.pathname)) event.respondWith(cacheFirst(request));
    return; // everything else under /Sound Effects/: plain network, not cached
  }

  if (/\.(png|webp|svg|ico|jpg|jpeg|gif|woff2?|ttf)$/i.test(path)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // styles.css, css/*.css, js/*.js, index.html, data: network first, cache as fallback.
  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  event.respondWith(networkFirst(request, isNavigation));
});
