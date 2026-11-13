// Uygulama dosyalarını çevrimdışı açılabilsin diye saklar.
// Tahmin verisi burada saklanmaz; o iş js/sources.js içindeki önbellektedir.
const CACHE = 'adp-shell-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/sources.js', 'js/compare.js', 'js/analysis.js', 'js/advisor.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Önce ağ (güncel sürüm gelsin), ağ yoksa saklanan kopya.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
