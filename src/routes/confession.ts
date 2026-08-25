/**
 * 表白墙 API 路由
 *
 * 路由表（挂载前缀 /api/confession）：
 *   GET    /      获取单条表白墙详情（含 likeCount）
 *   GET    /list  列表（content 截断预览 + likeCount）
 *   POST   /      发布表白墙
 *   DELETE /      软删除表白墙
 *
 * 安全规则：
 *   - authorId 永远不出现在任何返回数据中
 *   - 仅 view_anonymous_identity 权限可在内部追溯身份
 *
 * 所有写操作需认证 + 权限检查 + 频率限制（临时内存方案）。
 * DAL 返回 null / false → 统一 404（不暴露隐藏 ID）。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  getConfessionById,
  listConfessions,
  createConfession,
  softDeleteConfession,
  getLikeCount,
} from "../db";
import type { ConfessionInfo } from "../db/confession";
import type { ArchiveEnv } from "../utils/archive";
import type { CurrentUser } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import { PERM_CREATE_CONFESSION } from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 表白墙路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 内容字数上限 */
const CONTENT_LIMIT = 1000;

/** 列表预览截断长度 */
const PREVIEW_LENGTH = 100;

// ============================================================
//  路由实例
// ============================================================

const confessionRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /  — 获取单条表白墙详情（含点赞数）
// ------------------------------------------------------------

confessionRoutes.get("/", async (c) => {
  const id = c.req.query("id");
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const user = c.get("user");
  const archiveEnv: ArchiveEnv = {
    ENCRYPTION_KEY: c.env.ENCRYPTION_KEY ?? "",
    SITE_URL: new URL(c.req.url).origin,
  };

  const confession = await getConfessionById(c.env.DB, id, user, archiveEnv);
  if (!confession) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  // 查询点赞数
  const likeCount = await getLikeCount(c.env.DB, "confession", confession.id);

  // 返回数据：authorId 永远不暴露
  return c.json({
    success: true,
    data: {
      id: confession.id,
      content: confession.content,
      createdAt: confession.createdAt,
      updatedAt: confession.updatedAt,
      likeCount,
    },
  });
});

// ------------------------------------------------------------
//  GET /list  — 表白墙列表（预览 + 点赞数）
// ------------------------------------------------------------

confessionRoutes.get("/list", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const user = c.get("user");

  const confessions = await listConfessions(c.env.DB, user, limit, offset);

  // 为每条记录附加 likeCount + content 预览
  const items = await Promise.all(
    confessions.map(async (item: ConfessionInfo) => {
      const likeCount = await getLikeCount(c.env.DB, "confession", item.id);

      // 截取前 PREVIEW_LENGTH 个字符作为预览
      const preview =
        item.content.length > PREVIEW_LENGTH
          ? item.content.slice(0, PREVIEW_LENGTH) + "..."
          : item.content;

      return {
        id: item.id,
        preview,
        createdAt: item.createdAt,
        likeCount,
      };
    })
  );

  return c.json({ success: true, data: items });
});

// ------------------------------------------------------------
//  POST /  — 发布表白墙
// ------------------------------------------------------------

confessionRoutes.post("/", requirePermission(PERM_CREATE_CONFESSION), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 5 条
  const rate = checkRateLimit(user.id, "create_confession", 3600, 5);
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

  const content = (body.content as string) ?? "";

  // 内容校验
  if (!content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "内容不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (content.length > CONTENT_LIMIT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `内容最多 ${CONTENT_LIMIT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = await createConfession(c.env.DB, user.id, content);

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  DELETE /  — 软删除表白墙
// ------------------------------------------------------------

confessionRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  const id = c.req.query("id");
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await softDeleteConfession(c.env.DB, id, user as CurrentUser);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default confessionRoutes;
