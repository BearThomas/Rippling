/**
 * Rippling Service Worker
 *
 * 缓存策略：
 *   1. /api/* 请求：绝不缓存，直接走网络（网络失败时正常抛错，
 *      由前端统一错误处理展示）
 *   2. 页面导航（HTML）：Network First —— 在线始终拿最新 SPA 入口，
 *      离线时回退到缓存的 index.html（App Shell）
 *   3. 图片（含 B2 图床跨域图片）：Stale While Revalidate，
 *      缓存条目带时间戳，超过 7 天视为过期强制走网络
 *   4. 其他同源静态资源（JS / CSS / 字体 / 图标）：Stale While Revalidate
 *
 * 版本更新：
 *   - VERSION 变化 → 缓存名变化 → 新 SW install/activate 时清理旧缓存
 *   - skipWaiting + clients.claim 保证新版本立即接管所有页面
 *   - 发布新版时手动递增 VERSION 即可
 */

/* eslint-env serviceworker */

/** 缓存版本号：每次发版（sw.js 或资源结构变化）手动递增 */
const VERSION = "v2";

/** 静态资源缓存（App Shell：HTML / JS / CSS / 图标 / manifest） */
const STATIC_CACHE = `rippling-static-${VERSION}`;
/** 图片缓存（B2 图床等运行时图片，7 天过期） */
const IMAGE_CACHE = `rippling-images-${VERSION}`;

/** install 阶段预缓存的核心资源 */
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

/** 图片缓存最长保留期限（7 天） */
const IMAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 缓存条目时间戳头（读取时据此判断过期） */
const CACHED_AT_HEADER = "x-cached-at";

// ============================================================
//  生命周期
// ============================================================

self.addEventListener("install", (event) => {
  // 预缓存 App Shell 核心资源；skipWaiting 让新版 SW 立即接管
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // 清理旧版本缓存，并立即接管所有已打开页面
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("rippling-") && key !== STATIC_CACHE && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ============================================================
//  fetch 分发
// ============================================================

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 只处理 GET 请求（POST / PUT / DELETE 等写操作一律直连网络）
  if (request.method !== "GET") return;

  // 【关键】API 请求绝不缓存：直接网络请求，失败即失败
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Service Worker 自身的更新请求不走缓存
  if (url.pathname === "/sw.js") {
    event.respondWith(fetch(request));
    return;
  }

  // 页面导航：Network First（离线回退 App Shell）
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // 图片（同源或 B2 图床跨域）：SWR + 7 天过期
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, IMAGE_MAX_AGE_MS));
    return;
  }

  // 其余同源静态资源（JS / CSS / 字体等）：SWR 不限期
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, 0));
  }
  // 其他跨域非图片请求不拦截，走浏览器默认行为
});

// ============================================================
//  缓存策略实现
// ============================================================

/**
 * Network First：优先网络，成功后更新缓存，失败回退缓存
 *
 * 用于页面导航：在线始终获取最新 index.html；
 * 离线时回退缓存的 App Shell（SPA 任意路由均回退 /）。
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      // SPA 所有路由由 index.html 承载，统一按 "/" 缓存
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match(request)) || (await cache.match("/")) || Response.error();
  }
}

/**
 * Stale While Revalidate：命中且未过期立即返回缓存，同时后台更新；
 * 未命中或已过期则等待网络结果（失败时退回旧缓存兜底）
 *
 * @param {Request} request   请求
 * @param {string} cacheName  目标缓存空间
 * @param {number} maxAgeMs   缓存有效期（毫秒）；0 表示永不过期
 */
async function staleWhileRevalidate(request, cacheName, maxAgeMs) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // 后台更新任务：网络成功则写入缓存（附时间戳）
  const networkPromise = fetch(request)
    .then((response) => {
      // 正常响应与跨域 opaque 响应均可缓存
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, withTimestamp(response.clone()));
      }
      return response;
    })
    .catch(() => null);

  // 缓存命中且未过期：直接返回，后台静默更新
  if (cached && !isExpired(cached, maxAgeMs)) {
    return cached;
  }

  // 未命中 / 已过期：等待网络；网络失败则退回旧缓存兜底
  const fresh = await networkPromise;
  return fresh || cached || Response.error();
}

/** 给响应附加缓存时间戳头（供后续过期判断） */
function withTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** 判断缓存条目是否过期（无时间戳视为不过期；maxAgeMs 为 0 永不过期） */
function isExpired(response, maxAgeMs) {
  if (!maxAgeMs) return false;
  const cachedAt = Number(response.headers.get(CACHED_AT_HEADER));
  if (!cachedAt) return false;
  return Date.now() - cachedAt > maxAgeMs;
}
