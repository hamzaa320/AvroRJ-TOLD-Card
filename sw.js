/* RJ Load Sheet — Service Worker (cache-first, full offline after 1st visit) */
var CACHE = "rjload-v13";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./rjload-data.js",
  "./rjload-core.js",
  "./rjload-app.js",
  "./rjload-pdf.js",
  "./rjload-drive.js",
  "./rjload-queue.js",
  "./told_final_b64.js",
  "./pdf-lib.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./logo.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});
