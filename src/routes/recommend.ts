/**
 * 推荐流 / 置顶 API 路由
 *
 * 路由表（挂载前缀 /api/recommend）：
 *   GET    /     推荐流（游标分页，第一页含置顶）
 *   POST   /pin  置顶内容
 *   DELETE /pin  取消置顶
 *
 * 推荐流按评分公式排序，支持游标分页。
 * 置顶内容仅在第一页返回，后续翻页不返回。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { listRecommendations, pinItem, unpinItem, listActivePinned } from "../db";
import type { CurrentUser } from "../utils/permission";
import { PERM_PIN_POST } from "../shared/permissions";
import { VALIDATION_ERROR, NOT_FOUND } from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 推荐流路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

// ============================================================
//  路由实例
// ============================================================

const recommendRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /  — 推荐流（游标分页）
// ------------------------------------------------------------

recommendRoutes.get("/", async (c) => {
  const user = c.get("user");

  // 解析游标参数
  const lastScoreStr = c.req.query("lastScore");
  const lastId = c.req.query("lastId");
  const lastScore = lastScoreStr ? parseFloat(lastScoreStr) : undefined;

  // 获取推荐内容
  const result = await listRecommendations(c.env.DB, user, lastScore, lastId);

  // 第一页（无游标）额外返回置顶内容
  let pinned: unknown[] = [];
  if (lastScore === undefined && !lastId) {
    pinned = await listActivePinned(c.env.DB, user);
  }

  return c.json({
    success: true,
    data: {
      pinned,
      items: result.items,
      nextCursor: result.nextCursor,
    },
  });
});

// ------------------------------------------------------------
//  POST /pin  — 置顶内容
// ------------------------------------------------------------

recommendRoutes.post("/pin", requirePermission(PERM_PIN_POST), async (c) => {
  const user = c.get("user")!;

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
  const expiresAt = (body.expiresAt as string) ?? null;

  // 参数校验
  if (!targetType || !targetId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetType 或 targetId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 类型检查：表白墙不可置顶
  if (!["post", "timeline", "vote"].includes(targetType)) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "该类型不可置顶" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 校验 expiresAt 格式（如果提供）
  if (expiresAt && isNaN(Date.parse(expiresAt))) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "expiresAt 须为有效的 ISO 8601 日期" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await pinItem(c.env.DB, targetType, targetId, expiresAt, user as CurrentUser);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "置顶失败（已置顶或目标不存在）" } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  DELETE /pin  — 取消置顶
// ------------------------------------------------------------

recommendRoutes.delete("/pin", requirePermission(PERM_PIN_POST), async (c) => {
  const user = c.get("user")!;

  const targetType = c.req.query("targetType");
  const targetId = c.req.query("targetId");

  if (!targetType || !targetId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetType 或 targetId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await unpinItem(c.env.DB, targetType, targetId, user as CurrentUser);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "取消失败（置顶项不存在）" } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default recommendRoutes;
