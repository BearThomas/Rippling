/**
 * 登录墙中间件
 *
 * 三档由 site_config.loginWall 决定（none / soft / hard，缺省 hard），
 * **默认拒绝，白名单放行**。只在前端 router.beforeEach 里跳登录页是假墙 ——
 * 游客直接 curl /api/recommend 照样能把内容整段拿走。
 *
 * 挂载位置：src/functions/api/[[route]].ts 里 authMiddleware 之后、
 * deviceMiddleware 之前（被墙拦掉的请求不该再去碰设备表）。
 *
 * 两个刻意的取舍：
 *
 *   1. **档位有 10 秒进程内缓存**。每个 API 请求都去 D1 读一次站点配置太浪费；
 *      管理面板保存时会调用 bustLoginWallCache() 失效当前 isolate，
 *      其它 isolate 靠 TTL 过期。所以"改完最多 10 秒生效"。
 *   2. **站点未初始化时整面墙豁免**。否则初始化向导还没跑完，站长自己也进不来。
 */

import { createMiddleware } from "hono/factory";
import { getSiteConfig, loginWallOf, normalizeLoginWall } from "../db/siteConfig";
import type { LoginWallMode } from "../db/siteConfig";
import type { CloudflareEnv } from "../auth";
import { UNAUTHORIZED } from "../utils/errors";
import type { AppContextVars } from "./auth";

// ============================================================
//  白名单
// ============================================================

/**
 * 永远放行（没登录也要能用，否则登录页都画不出来）
 *
 * 注意不用写 /api/auth/* —— 它挂在另一个 entry（functions/auth、worker 的
 * /api/auth 分支），本来就到不了这层。
 */
const ALWAYS_PUBLIC = [
  "/api/config",
  "/api/setup", // /api/setup/status、/api/setup/initialize
  "/api/bootstrap", // 前端靠它判断"我登录了没有"
  "/api/health",
  "/api/image", // 图片是随机 UUID 的 key，公开不泄露内容；软墙下帖子配图要用
  "/api/permissions/me", // 游客返回 "0"，没有信息量
];

/**
 * 软墙额外放行（**只放 GET**）
 *
 * 这四条不是随手挑的：PostDetailView 打开一条帖子正好调
 * GET /api/post?id= → GET /api/post/comments → GET /api/user/profile
 * → GET /api/block?id=，少一条那个页面就会弹错误 Toast。
 */
const SOFT_PUBLIC_GET = [
  "/api/post", // 单条详情（?id=）
  "/api/post/comments",
  "/api/user/profile",
  "/api/block", // 板块详情（?id=）
];

function isAlwaysPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isSoftPublic(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  return SOFT_PUBLIC_GET.includes(pathname);
}

// ============================================================
//  档位缓存
// ============================================================

const MODE_TTL_MS = 10_000;

let cachedMode: LoginWallMode | null = null;
let cachedAt = 0;

/** 管理面板保存配置后调一下，让当前 isolate 立刻用新档位 */
export function bustLoginWallCache(): void {
  cachedMode = null;
  cachedAt = 0;
}

async function resolveMode(env: CloudflareEnv): Promise<LoginWallMode> {
  const now = Date.now();
  if (cachedMode && now - cachedAt < MODE_TTL_MS) return cachedMode;

  const config = await getSiteConfig(env.DB);
  // 没配置 / 没初始化过：什么都没有，也就没什么好护的（而且要先让人进得去跑初始化）
  const mode = !config || config.initialized !== true ? "none" : loginWallOf(config);

  cachedMode = normalizeLoginWall(mode);
  cachedAt = now;
  return cachedMode;
}

// ============================================================
//  中间件
// ============================================================

export const loginWall = createMiddleware<{
  Variables: AppContextVars;
  Bindings: CloudflareEnv;
}>(async (c, next) => {
  const { pathname } = new URL(c.req.url);

  if (isAlwaysPublic(pathname)) {
    await next();
    return;
  }

  const mode = await resolveMode(c.env);
  if (mode === "none") {
    await next();
    return;
  }

  // 软墙：单条帖子那几条只读接口放行（其余照拦）
  if (mode === "soft" && isSoftPublic(c.req.method, pathname)) {
    await next();
    return;
  }

  // 已经登录的人不受墙影响
  if (c.get("user")) {
    await next();
    return;
  }

  return c.json(
    {
      success: false as const,
      error: {
        // code 保持 UNAUTHORIZED：前端 client.ts 认得它（会跳登录页），
        // 这里只把 message 换成人能看懂的一句话
        code: UNAUTHORIZED.code,
        message: "这个站需要登录后才能使用",
      },
    },
    UNAUTHORIZED.statusCode
  );
});
