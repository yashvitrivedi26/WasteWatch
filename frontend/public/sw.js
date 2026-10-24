// WasteWatch service worker: makes the site installable and opens it instantly.
// Pages and built files: cached copy first, refreshed in the background. API calls and photos: always live.
const CACHE = 'ww-shell-v1';
const SHELL = ['/', '/index.html', '/favicon.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/media')) return; // live data only
  if (e.request.mode === 'navigate') {
    // single-page app: any route opens index.html; offline falls back to the cached copy
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put('/index.html', r.clone())); return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  // only built files and the app icons are cached (dev-server modules always come live)
  if (!(url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname) || url.pathname.startsWith('/icon-'))) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const live = fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || live;
  }));
});
