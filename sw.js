// Offline support.
// Pages: try the network first (so updates show up right away), but fall back to the saved copy
// after 3 seconds or when there's no signal. Other files: saved copy first, refreshed in the background.
const CACHE = 'shiftpoints-v12';
const FILES = ['./', './index.html', './ops.js', './logo.png', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNetwork(req){
  return fetch(req, { cache: 'no-store' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(path) || path.endsWith('ops.js');
  if (isPage){
    e.respondWith(new Promise(resolve => {
      let done = false;
      const finish = res => { if (!done && res){ done = true; clearTimeout(timer); resolve(res); } };
      const saved = () => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'));
      const timer = setTimeout(() => saved().then(finish), 3000);
      fromNetwork(req).then(finish).catch(() => saved().then(hit => finish(hit || Response.error())));
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fromNetwork(req)));
});
