// Service Worker — 讓 App 能離線開啟、可安裝到桌面。
// 改版時把 CACHE 版本號 +1，舊快取會自動清掉。
const CACHE = 'fit-track-v18';

// App 殼層：第一次開啟時就快取起來，之後沒網路也能開。
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/state.js',
  './js/ui.js',
  './js/metrics.js',
  './js/csv.js',
  './js/seed.js',
  './js/exercise-picker.js',
  './js/screens/home.js',
  './js/screens/exercises.js',
  './js/screens/session.js',
  './js/screens/template.js',
  './js/screens/settings.js',
  './js/screens/report.js',
  './vendor/chart.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // 個別加入，缺一個檔案不會讓整個安裝失敗
      Promise.allSettled(SHELL.map((url) => c.add(url)))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 策略：先看快取，沒有再上網；上網成功就順手存起來（runtime caching）。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (req.url.startsWith(self.location.origin) || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
