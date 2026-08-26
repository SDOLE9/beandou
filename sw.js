/* 拼豆计时管理系统 - Service Worker（离线缓存）
   使 v1 / v3 两套界面可安装、离线可用 */
const CACHE = 'pdb-cache-v1';
const CORE = [
  './',
  './index.html',
  './index-v3.html',
  './styles.css',
  './styles-v3.css',
  './app.js',
  './icon.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const origin = new URL(req.url).origin;
  // 跨域资源（如 Google Fonts）：缓存优先，失败再联网
  if (origin !== self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        return cached || fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // 同源资源：网络优先，失败回退缓存（忽略 query，兼容 ?v=x 版本号）
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => {
      return caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
    })
  );
});