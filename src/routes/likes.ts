/**
 * 点赞 API 路由
 *
 * 路由表（挂载前缀 /api/like）：
 *   POST /        切换点赞状态（赞 / 取消）
 *   GET  /count   获取指定目标的点赞总数
 *
 * 点赞操作需要 like 权限，频率限制每小时 50 次。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { toggleLike, getLikeCount } from "../db";
import { checkRateLimit } from "../utils/rate-limit";
import { PERM_LIKE } from "../shared/permissions";
import { VALIDATION_ERROR, RATE_LIMITED } from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

const likeRoutes = new Hono<E>();

// ------------------------------------------------------------
//  POST /  — 切换点赞（赞 ↔ 取消）
// ------------------------------------------------------------

likeRoutes.post("/", requirePermission(PERM_LIKE), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 50 次
  const rate = checkRateLimit(user.id, "like", 3600, 50);
  if (rate.limited) {
    return c.json(
      { success: false, error: { code: RATE_LIMITED.code, message: RATE_LIMITED.message } },
      RATE_LIMITED.statusCode as any
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求体格式错误" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const targetType = body.targetType as string;
  const targetId = body.targetId as string;

  if (!targetType || !targetId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetType 或 targetId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const result = await toggleLike(c.env.DB, targetType, targetId, user.id);

  return c.json({ success: true, data: { liked: result.liked, likeCount: result.count } });
});

// ------------------------------------------------------------
//  GET /count  — 获取点赞总数（公开接口，仅需认证）
// ------------------------------------------------------------

likeRoutes.get("/count", async (c) => {
  const targetType = c.req.query("targetType");
  const targetId = c.req.query("targetId");

  if (!targetType || !targetId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetType 或 targetId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const count = await getLikeCount(c.env.DB, targetType, targetId);

  return c.json({ success: true, data: { count } });
});

export default likeRoutes;
