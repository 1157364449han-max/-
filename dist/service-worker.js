'use strict';

const VERSION = '0.23.1';
const CACHE = `dongjiexi-app-${VERSION}`;
const CORE = [
  './math-input.js', './tangent-solver.js',
  './', './index.html', './offline.html', './manifest.webmanifest', './app-version.json',
  './runtime-config.js', './runtime.js', './pwa.js', './learning-ui.css', './learning-ui.js', './classroom.css',
  './classroom.js', './construction-board.js', './drag-board.js', './equation-builder.js', './math-keyboard.js', './geogebra-bridge.js',
  './releases.json', './icons/icon.svg', './icons/maskable.svg',
  './vendor/katex/katex.min.css', './vendor/katex/katex.min.js',
  './vendor/katex/contrib/auto-render.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async url => {
      const response = await fetch(new Request(url, {cache: 'reload'}));
      if (!response.ok) throw new Error(`precache failed: ${url}`);
      await cache.put(url, response);
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('dongjiexi-app-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;
  const alwaysFresh = /\/(?:runtime-config\.js|app-version\.json|service-worker\.js)$/.test(url.pathname);
  if (alwaysFresh) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(new Request(request, {cache: 'no-store'}));
        if (response.ok) {
          cache.put(request, response.clone());
          return response;
        }
        return (await cache.match(request, {ignoreSearch: true})) || response;
      } catch {
        return (await cache.match(request, {ignoreSearch: true})) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, {ignoreSearch: true});
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
