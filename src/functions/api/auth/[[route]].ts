/**
 * Better Auth 认证入口（/api/auth 路径）
 *
 * 前端统一请求 /api/auth/*，本入口与 /auth 入口共用同一处理器
 * （handleAuthRequest），确保两条路径行为完全一致。
 */

import type { CloudflareEnv } from "../../../auth";
import { handleAuthRequest } from "../../auth/[[route]]";

// ============================================================
//  onRequest：Cloudflare Pages Functions 入口
// ============================================================

export const onRequest: PagesFunction<CloudflareEnv> = (context) =>
  handleAuthRequest(context.request, context.env);
