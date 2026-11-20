/* KATAL Roadshow – service worker: lets the app open with no internet. */
var VERSION = 'katal-shell-v5';
var FONT_CACHE = 'katal-fonts-v1';
var SHELL = [
  './', './index.html', './css/app.css', './js/config.js', './js/core.js', './js/app.js',
  './admin.html', './css/admin.css', './js/admin.js', './manifest.webmanifest', './img/roadshow-64.png', './img/roadshow-192.png', './img/roadshow-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== FONT_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function withTimeout(p, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (r) { clearTimeout(t); resolve(r); }, function (err) { clearTimeout(t); reject(err); });
  });
}

// Same-origin files: network first (always newest version), cache as fallback when offline.
function networkFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    return withTimeout(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }), 6000).then(function (res) {
      if (res && res.ok) cache.put(req.url.split('#')[0].split('?')[0], res.clone());
      return res;
    }).catch(function () {
      var key = req.url.split('#')[0].split('?')[0];
      return cache.match(key).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html').then(function (i) { return i || cache.match('./'); });
        return Response.error();
      });
    });
  });
}

// Google Fonts: cache first.
function cacheFirst(req) {
  return caches.open(FONT_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { cache.put(req, res.clone()); return res; });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});
