var CACHE_NAME = 'aie-pages-1077-v40';
var STATIC_FILES = [
  './',
  './index.html',
  './acceso-alumnos.html',
  './portal-funcional.html',
  './portal-funcional.js',
  './aie-hub.webmanifest',
  './aie-hub-sw.js',
  './portal-docente.html',
  './portal-docente.js',
  './portal-docente-fixes.js',
  './solicitud-actividad.html',
  './solicitud-actividad.js',
  './aie-login-redirect.js',
  './alumnos.html',
  './alumnos.js',
  './lector-qr.html',
  './lector-qr.js',
  './lector-qr.webmanifest',
  './lector-qr-icon.svg',
  './styles.css',
  './aie-runtime.js',
  './aie-public-config.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) {
          return caches.delete(name);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.indexOf('/api/') >= 0) {
    return;
  }
  event.respondWith(
    fetch(event.request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
      }
      return response;
    }).catch(function () {
      return caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
        return cached || caches.match(event.request);
      });
    })
  );
});
