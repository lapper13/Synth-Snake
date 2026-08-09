/* Cache-first service worker for Synth-Snake.
 *
 * Cache-first, not network-first, on purpose. A saturated conference network is
 * slower than no network at all: network-first would sit waiting on a request
 * that eventually fails. Serving from cache first means a bad network behaves
 * exactly like airplane mode.
 *
 * Bump CACHE when any asset changes, or returning visitors keep the old build.
 */
const CACHE = 'synth-snake-v7';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});
