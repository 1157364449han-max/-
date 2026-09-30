'use strict';

const VERSION = '0.43.1';
const CACHE = `dongjiexi-app-${VERSION}`;
const CORE = [
  './conic-parameter.js',
  './math-input.js', './number-display.js', './tangent-solver.js', './ellipse-distance.js', './orthogonal-chord.js', './ellipse-focal-chord.js', './axis-intercept-chord.js',
  './', './index.html', './offline.html', './manifest.webmanifest', './app-version.json',
  './runtime-config.js', './runtime.js', './scene-contract.mjs', './scene-audit.js', './cloud-contract.mjs', './external-contract.mjs', './external-ai.js', './pwa.js', './theme.css', './learning-ui.css', './learning-ui.js', './classroom.css',
  './classroom.js', './construction-board.js', './drag-board.js', './equation-builder.js', './math-keyboard.js', './mathlive-adapter.js', './geogebra-bridge.js',
  './question-bank.js', './question-bank.css', './question-bank.json',
  './releases.json', './icons/icon.svg', './icons/maskable.svg',
  './vendor/katex/katex.min.css', './vendor/katex/katex.min.js',
  './vendor/katex/contrib/auto-render.min.js',
  './vendor/mathlive/mathlive.min.mjs', './vendor/mathlive/mathlive-fonts.css',
  './vendor/mathlive/fonts/KaTeX_AMS-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Caligraphic-Bold.woff2', './vendor/mathlive/fonts/KaTeX_Caligraphic-Regular.woff2',
  './vendor/mathlive/fonts/KaTeX_Fraktur-Bold.woff2', './vendor/mathlive/fonts/KaTeX_Fraktur-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Main-Bold.woff2',
  './vendor/mathlive/fonts/KaTeX_Main-BoldItalic.woff2', './vendor/mathlive/fonts/KaTeX_Main-Italic.woff2', './vendor/mathlive/fonts/KaTeX_Main-Regular.woff2',
  './vendor/mathlive/fonts/KaTeX_Math-BoldItalic.woff2', './vendor/mathlive/fonts/KaTeX_Math-Italic.woff2', './vendor/mathlive/fonts/KaTeX_SansSerif-Bold.woff2',
  './vendor/mathlive/fonts/KaTeX_SansSerif-Italic.woff2', './vendor/mathlive/fonts/KaTeX_SansSerif-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Script-Regular.woff2',
  './vendor/mathlive/fonts/KaTeX_Size1-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Size2-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Size3-Regular.woff2',
  './vendor/mathlive/fonts/KaTeX_Size4-Regular.woff2', './vendor/mathlive/fonts/KaTeX_Typewriter-Regular.woff2'
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
