const CACHE = "first-touch-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./css/app.css",
  "./js/main.js",
  "./js/engine.js",
  "./js/render.js",
  "./vendor/three.module.js",
  "./vendor/three-LICENSE",
  "./js/roster.js",
  "./js/squads.js",
  "./js/storage.js",
  "./js/formations.js",
  "./js/rng.js",
  "./js/portraits.js",
  "./js/audio.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/barlow-condensed-600.woff2",
  "./fonts/barlow-condensed-700.woff2",
  "./fonts/outfit-400.woff2",
  "./fonts/outfit-500.woff2",
  "./fonts/outfit-700.woff2",
  "./fonts/OFL.txt",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || fetched;
    })
  );
});
