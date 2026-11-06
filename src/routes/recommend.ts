/**
 * 推荐流 / 置顶 API 路由
 *
 * 路由表（挂载前缀 /api/recommend）：
 *   GET    /     推荐流（游标分页，第一页含置顶）
 *   POST   /pin  置顶大事记 / 投票
 *   DELETE /pin  取消置顶（帖子也认，用于清理历史数据）
 *
 * 推荐流按评分公式排序，支持游标分页。
 * 置顶内容只在第一页返回；已置顶的内容不再出现在下面的列表里
 * （否则首页同一篇帖子会出现两次）。
 *
 * 帖子置顶不在这里：它的写入口是 POST /api/post/pin（改 post.isPinned）。
 * 原因见 db/pinned.ts 顶部的说明 —— 一件事只留一个写入口。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  listRecommendations,
  pinItem,
  unpinItem,
  listActivePinned,
  listPinnedRefs,
} from "../db";
import type { CurrentUser } from "../utils/permission";
import { PERM_PIN_POST } from "../shared/permissions";
import {
  VALIDATION_ERROR,
  NOT_FOUND,
  FORBIDDEN,
  INTERNAL_ERROR,
} from "../utils/errors";

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

  // 只有第一页展示置顶区（不传任何游标）
  const firstPage = lastScore === undefined && !lastId;

  // 置顶内容：第一页要完整数据用于展示；每一页都要一份 id 清单用于剔除，
  // 否则"第一页剔过、第二页没剔"会让游标错位、正文重复
  const pinned = firstPage ? await listActivePinned(c.env.DB, user) : [];
  const refs = await listPinnedRefs(c.env.DB);
  const exclude = new Set(refs.map((r) => `${r.targetType}:${r.targetId}`));

  // 获取推荐内容
  const result = await listRecommendations(
    c.env.DB,
    user,
    lastScore,
    lastId,
    undefined,
    exclude
  );

  return c.json({
    success: true,
    data: {
      pinned: firstPage ? pinned : [],
      items: result.items,
      nextCursor: result.nextCursor,
    },
  });
});

// ------------------------------------------------------------
//  POST /pin  — 置顶大事记 / 投票
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
  const rawExpiresAt = body.expiresAt;
  const expiresAt = rawExpiresAt === undefined || rawExpiresAt === null
    ? null
    : String(rawExpiresAt);

  if (!targetType || !targetId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetType 或 targetId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const result = await pinItem(
    c.env.DB,
    targetType,
    targetId,
    expiresAt,
    user as CurrentUser
  );

  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        return c.json(
          { success: false, error: { code: FORBIDDEN.code, message: "无置顶权限" } },
          FORBIDDEN.statusCode as any
        );
      case "invalid_type":
        return c.json(
          {
            success: false,
            error: {
              code: VALIDATION_ERROR.code,
              message:
                targetType === "post"
                  ? "帖子置顶请用 POST /api/post/pin"
                  : "该类型不可置顶（仅支持 timeline / vote）",
            },
          },
          VALIDATION_ERROR.statusCode as any
        );
      case "invalid_target":
        return c.json(
          { success: false, error: { code: NOT_FOUND.code, message: "目标不存在或未通过审核" } },
          NOT_FOUND.statusCode as any
        );
      case "expired":
        return c.json(
          { success: false, error: { code: VALIDATION_ERROR.code, message: "expiresAt 须为未来的有效 ISO 8601 日期" } },
          VALIDATION_ERROR.statusCode as any
        );
      case "already_pinned":
        return c.json(
          { success: false, error: { code: "ALREADY_PINNED", message: "该内容已置顶" } },
          409 as any
        );
      default:
        return c.json(
          { success: false, error: { code: INTERNAL_ERROR.code, message: "置顶失败，请稍后重试" } },
          INTERNAL_ERROR.statusCode as any
        );
    }
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

  const result = await unpinItem(c.env.DB, targetType, targetId, user as CurrentUser);

  if (!result.ok) {
    if (result.reason === "forbidden") {
      return c.json(
        { success: false, error: { code: FORBIDDEN.code, message: "无置顶权限" } },
        FORBIDDEN.statusCode as any
      );
    }
    if (result.reason === "error") {
      return c.json(
        { success: false, error: { code: INTERNAL_ERROR.code, message: "取消失败，请稍后重试" } },
        INTERNAL_ERROR.statusCode as any
      );
    }
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "该内容未置顶" } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default recommendRoutes;
