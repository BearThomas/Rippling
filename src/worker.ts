/**
 * Cloudflare Worker 入口（单入口 + Static Assets）
 *
 * 与 Pages 版（src/functions/**，文件路由）等价，路由顺序是关键：
 *
 *   1. /api/auth/*  → Better Auth（必须排在 /api/* 之前，
 *                     否则会被 Hono 的 /api/* 中间件当成普通接口吃掉）
 *   2. /api/*       → Hono app（中间件顺序与 Pages 版完全一致）
 *   3. /manifest    → 动态 PWA manifest
 *   4. 其他         → 静态资源（public/），未知路径由
 *                     not_found_handling = "single-page-application" 回退 index.html
 *
 * 部署：npx wrangler deploy --config wrangler.worker.jsonc
 */

import type { CloudflareEnv } from "./auth";
import { app } from "./functions/api/[[route]]";
import { handleAuthRequest } from "./functions/auth/[[route]]";
import { handleManifest } from "./functions/manifest";

/** Worker 绑定：CloudflareEnv 加上静态资源绑定 */
export interface WorkerEnv extends CloudflareEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    // 1) 认证：两条前缀都认（/auth/* 是历史路径，前端只用 /api/auth/*）
    if (pathname.startsWith("/api/auth/") || pathname.startsWith("/auth/")) {
      return handleAuthRequest(request, env);
    }

    // 2) 动态 manifest
    if (pathname === "/manifest") {
      return handleManifest(request, env);
    }

    // 3) 业务接口
    if (pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    // 4) 静态资源 + SPA 回退
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
