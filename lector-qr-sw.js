var CACHE_NAME = 'lector-qr-1077-v1';
var STATIC_FILES = [
  './lector-qr.html',
  './lector-qr.js',
  './lector-qr.webmanifest',
  './lector-qr-icon.svg',
  './styles.css',
  './aie-runtime.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_FILES);
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) return caches.delete(name);
        return null;
      }));
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.indexOf('/api/') >= 0 || url.pathname.indexOf('/actividad/') >= 0) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
