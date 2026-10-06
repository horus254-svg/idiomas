// Offline support: keeps the app files cached so it opens without internet.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'idiomas-v3.0.0';
const FILES = [
  './', './index.html', './app.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './lang_zh.js', './lang_en.js', './lang_pt.js', './lang_ko.js', './lang_ru.js', './lang_ja.js', './lang_it.js', './lang_fr.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache first (fast and offline), then refresh the cached copy in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, {ignoreSearch: true});
    const net = fetch(req).then(res => { if(res && res.ok) cache.put(req.url.split('?')[0], res.clone()); return res; }).catch(() => null);
    if(hit){ e.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response('Sin conexión', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }));
});
