'use strict';
const CACHE = 'loop-mobile-v1';
const SHELL = ['/mobile', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for everything — never serve stale shell
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
