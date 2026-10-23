/*
 * AI Hub Service Worker —— 手写、零依赖。
 *
 * 缓存策略（与产品隐私口径一致：只缓存「站点自身的静态资源」，不碰任何动态数据）：
 *  - 页面导航（request.mode === 'navigate'）：网络优先，网络失败回退 /offline。
 *    不缓存带 Cookie 的动态 HTML，避免把别人的登录态页面缓存成离线壳。
 *  - /_next/static/* 与 /icons/*：缓存优先（内容哈希文件名，天然不可变）。
 *  - 其余同源 GET：直连网络（= 无 SW 时的默认行为）。
 *  - POST / 非 GET、跨域（各平台官网）、/api/*：完全不拦截。
 */
const VERSION = 'v1';
const CACHE_NAME = `aihub-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('aihub-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 页面导航：网络优先，离线回退
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  // 不可变静态资源：缓存优先
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        if (hit !== undefined) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
  }
});
