// sw.js – cache simplu pentru fișierele aplicației (necesar pentru instalare ca PWA/APK)
const CACHE = 'fitpet-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './auth.js', './storage.js', './missions.js', './pets.js', './camera.js', './ai-counter.js', './manifest.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
});
