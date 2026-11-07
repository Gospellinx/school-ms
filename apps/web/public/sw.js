/* Linx School service worker: lets staff open the app and their score sheets and registers with no connection.
 *
 * - App code (/_next/static) never changes at a given URL, so it is served from the cache first.
 * - Pages and API reads (/bff GET) go to the network first and fall back to the last copy on this device.
 * - Writes are never cached here. The page keeps them in an outbox (see src/lib/offline.ts) and sends them when back online.
 * Bump VERSION to drop old caches after a change to this file.
 */
const VERSION = 'v1';
const STATIC = `linx-static-${VERSION}`;
const PAGES = `linx-pages-${VERSION}`;
const DATA = `linx-data-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('linx-') && ![STATIC, PAGES, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('linx-')).map((k) => caches.delete(k)))));
  }
});

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    // Only keep good answers: never a sign-in redirect or an error page.
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    if (fallback) {
      const page = await caches.match(fallback);
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Sign-in, sign-out and payment pages always need the network.
  if (url.pathname.startsWith('/session') || url.pathname.startsWith('/pay')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname.startsWith('/bff/')) {
    // Files (downloads) can be large; only keep JSON reads.
    if (url.pathname.endsWith('/file')) return;
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, PAGES, OFFLINE_URL));
  }
});
