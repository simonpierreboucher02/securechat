// Basic Service Worker for PWA
const CACHE_NAME = 'securechat-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(event) {
  // Simple network-first strategy
  event.respondWith(
    fetch(event.request).catch(function() {
      // Fallback to cache if network fails
      return caches.match(event.request);
    })
  );
});