'use strict';
// v2 — no caching, network only. Exists solely for PWA installability.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
// All requests go straight to network — no cache, never stale.
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
