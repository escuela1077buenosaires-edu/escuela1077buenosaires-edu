var CACHE_NAME = 'lector-qr-1077-v8-20260728';
var STATIC_FILES = [
  './lector-qr.html',
  './lector-qr.js',
  './lector-qr.webmanifest',
  './lector-qr-icon.svg',
  './styles.css',
  './aie-runtime.js',
  './aie-login-redirect.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_FILES);
    }).then(function () {
      return self.skipWaiting();
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
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.indexOf('/api/') >= 0 || url.pathname.indexOf('/actividad/') >= 0) {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(event.request, copy);
      }).catch(function () {});
      return response;
    }).catch(function () {
      return caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
        return cached || caches.match(event.request);
      });
    })
  );
});
