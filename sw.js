/* KATAL Roadshow – service worker.
 * Opens instantly from the copy saved on the phone (works with no internet), and quietly
 * downloads the newest version in the background for the next time the app is opened. */
var VERSION = 'katal-shell-v7';
var SHELL = [
  './', './index.html', './admin.html',
  './css/app.css', './css/admin.css',
  './js/config.js', './js/core.js', './js/app.js', './js/admin.js',
  './fonts/manrope.woff2', './manifest.webmanifest',
  './img/roadshow-64.png', './img/roadshow-180.png', './img/roadshow-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // cache: 'reload' skips the browser's HTTP cache so a new version really gets the new files
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () { /* ignore */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keyOf(url) { return url.split('#')[0].split('?')[0]; }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the Google API is never cached here
  var key = keyOf(req.url);
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(key).then(function (hit) {
      var net = fetch(key, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      });
      if (hit) {
        e.waitUntil(net.catch(function () { /* offline: keep the saved copy */ }));
        return hit;
      }
      return net.catch(function () {
        if (req.mode === 'navigate') return cache.match(keyOf(self.registration.scope)).then(function (i) { return i || cache.match('./index.html'); });
        return Response.error();
      });
    });
  }));
});
