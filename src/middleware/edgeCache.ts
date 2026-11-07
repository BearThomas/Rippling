/**
 * 边缘缓存中间件
 *
 * 目的：把"每个用户打开首页都要跨境跑 5 个接口"压到尽可能少。
 * 做法：对这些 GET 接口在 Cloudflare 的边缘缓存（Cache API）里存一份，
 * 命中就直接返回，不再执行后面的中间件和数据库查询。
 *
 * 只缓存明确安全的接口，规则写在下面这张表里：
 *
 *   /api/config          60s   所有人一样（站点配置）
 *   /api/setup/status    60s   所有人一样（是否已初始化）
 *   /api/recommend       30s   第一页、按用户分桶（同一用户 30 秒内复用）
 *   /api/image           1 年  图片是不可变资源
 *
 * 注意：
 *   - 只有 GET，且只匹配白名单（精确前缀），别的接口一律直通；
 *   - /api/recommend 带 Cookie 时按用户 id 分桶，不会把 A 的推荐流给 B；
 *   - Cache API 在本地 wrangler dev 里也支持，行为一致；
 *   - 管理面板保存配置后会调用 purgeEdgeCache 把相关条目清掉，不用等 TTL。
 */

import { createMiddleware } from "hono/factory";
import type { AppContextVars } from "./auth";
import type { CloudflareEnv } from "../auth";

/** 允许边缘缓存的接口规则 */
interface CacheRule {
  /** 路径前缀（精确到接口，不做模糊匹配） */
  prefix: string;
  /** 缓存秒数 */
  ttl: number;
  /** 是否按用户分桶（内容是因人而异的） */
  perUser?: boolean;
  /** 要不要带 Cookie 才分桶（推荐流对游客一样，可以共享） */
  skipWhenCookie?: boolean;
}

const RULES: CacheRule[] = [
  { prefix: "/api/config", ttl: 60 },
  { prefix: "/api/setup/status", ttl: 60 },
  { prefix: "/api/recommend", ttl: 30, perUser: true },
  { prefix: "/api/image", ttl: 31536000 },
];

/** 从 Cookie 里取会话 token（只用于分桶，不做校验） */
function sessionTokenFromCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

/** 找到命中的规则 */
function matchRule(pathname: string): CacheRule | null {
  for (const rule of RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) return rule;
  }
  return null;
}

/**
 * 计算缓存 key
 *
 * perUser 的规则用「路径 + 会话 token 的 SHA-256 前 16 位」做 key：
 * 不把原始 token 写进 key（避免它出现在日志/缓存列表里），也几乎不可能撞号
 * （撞号意味着把别人的推荐流发给这个用户，太贵了，不能用取模哈希省事）。
 */
async function buildCacheKey(
  requestUrl: string,
  rule: CacheRule,
  cookie: string | null,
  /** 站点配置版本：配置一改，旧缓存自然失效（否则改完权重 30 秒内还是老顺序） */
  configEpoch: string
): Promise<Request> {
  const url = new URL(requestUrl);

  if (!rule.perUser) {
    url.searchParams.delete("__u");
    return new Request(url.toString(), { method: "GET" });
  }

  if (configEpoch) url.searchParams.set("__e", configEpoch);

  const token = sessionTokenFromCookie(cookie);
  if (!token) {
    url.searchParams.set("__u", "anon");
    return new Request(url.toString(), { method: "GET" });
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const short = Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  url.searchParams.set("__u", short);
  return new Request(url.toString(), { method: "GET" });
}

/** 给浏览器的 Cache-Control（perUser 的内容只能私有缓存） */
function clientCacheControl(rule: CacheRule): string {
  return rule.perUser ? "private, max-age=15" : `public, max-age=${rule.ttl}, s-maxage=${rule.ttl}`;
}

export const edgeCache = createMiddleware<{
  Variables: AppContextVars;
  Bindings: CloudflareEnv;
}>(async (c, next) => {
  if (c.req.method !== "GET") {
    await next();
    return;
  }

  const rule = matchRule(new URL(c.req.url).pathname);
  if (!rule) {
    await next();
    return;
  }

  // 本地没开缓存时（caches 未定义）直接直通，不影响开发
  if (typeof caches === "undefined" || !caches.default) {
    await next();
    return;
  }

  const cache = caches.default;
  const cookie = c.req.header("Cookie") ?? null;

  // 配置版本：只有"内容会随配置变"的接口才需要（推荐流权重、类型基础分）
  let configEpoch = "";
  if (rule.perUser) {
    try {
      const row = await c.env.DB.prepare(
        "SELECT updatedAt FROM site_config WHERE configKey = 'site_config'"
      ).first<{ updatedAt: string | null }>();
      configEpoch = row?.updatedAt ?? "0";
    } catch {
      // 读不到就退化：不加版本号（宁可这条缓存短暂过期，也别让请求失败）
      configEpoch = "";
    }
  }

  const key = await buildCacheKey(c.req.url, rule, cookie, configEpoch);

  const hit = await cache.match(key);
  if (hit) {
    // 缓存里存的那份是"给共享缓存看"的头；回给浏览器时要换成按规则的
    // （perUser 的内容必须 private，否则中间代理可能把它给别的用户）
    const hitHeaders = new Headers(hit.headers);
    hitHeaders.set("Cache-Control", clientCacheControl(rule));
    hitHeaders.set("X-Edge-Cache", "HIT");

    return new Response(hit.body, {
      status: hit.status,
      statusText: hit.statusText,
      headers: hitHeaders,
    });
  }

  await next();

  // 只缓存成功响应
  const status = c.res.status;
  if (status !== 200) {
    c.res.headers.set("X-Edge-Cache", "MISS");
    return;
  }

  // 缓存这一层永远不许把响应搞坏：任何异常都退化成"不缓存，照常返回"
  try {
    // 注意顺序：必须**先 clone 再取 body**。
    // 反过来写（先 new Response(base.body) 再 base.clone()）会抛
    // "Response body is already used"，而这个异常会把这个请求变成 500。
    const base = c.res.clone();
    const storeSource = base.clone();

    const clientHeaders = new Headers(base.headers);
    clientHeaders.set("Cache-Control", clientCacheControl(rule));
    clientHeaders.set("X-Edge-Cache", "MISS");
    const clientResponse = new Response(base.body, {
      status: base.status,
      statusText: base.statusText,
      headers: clientHeaders,
    });

    // 进 Cache API 的那份必须去掉 private：Cloudflare 的 Cache API 会直接
    // 拒绝带 private / no-store / Set-Cookie 的响应（留着就永远写不进去）
    const storeHeaders = new Headers(storeSource.headers);
    storeHeaders.set("Cache-Control", `public, max-age=${rule.ttl}, s-maxage=${rule.ttl}`);
    storeHeaders.delete("Set-Cookie");
    const storeResponse = new Response(storeSource.body, {
      status: storeSource.status,
      statusText: storeSource.statusText,
      headers: storeHeaders,
    });

    const store = cache.put(key, storeResponse);
    try {
      c.executionCtx.waitUntil(store);
    } catch {
      // Pages 入口没传 executionCtx 时退化成同步等待
      await store;
    }

    c.res = clientResponse;
  } catch (error) {
    console.error("[edgeCache] 写缓存失败，本次不缓存:", error);
    c.res.headers.set("X-Edge-Cache", "SKIP");
  }
});

/**
 * 清掉某个路径的缓存（管理面板改配置后调用）
 *
 * 只清非 perUser 的规则 —— 推荐流按用户分桶，key 不可枚举，
 * 交给它自己的 30 秒 TTL 自然过期。
 */
export async function purgeEdgeCache(requestUrl: string): Promise<void> {
  if (typeof caches === "undefined" || !caches.default) return;
  const url = new URL(requestUrl);
  const targets = ["/api/config", "/api/setup/status"].filter(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
  );
  for (const prefix of targets) {
    const key = new Request(new URL(prefix, url.origin).toString(), { method: "GET" });
    await caches.default.delete(key);
  }
}
