/**
 * 帖子 / 评论 API 路由
 *
 * 路由表（挂载前缀 /api/post）：
 *   GET    /          获取单个帖子
 *   POST   /          创建帖子
 *   PUT    /          编辑帖子内容
 *   DELETE /          软删除帖子
 *   GET    /comments  获取子评论列表
 *   POST   /comment   创建评论
 *   POST   /pin       置顶 / 取消置顶
 *
 * 所有写操作需认证 + 权限检查 + 频率限制（临时内存方案）。
 * DAL 返回 null / false → 统一 404（不暴露隐藏 ID）。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  getPostById,
  listPostsByParent,
  createPost,
  createPostWithVisibility,
  updatePostContent,
  softDeletePost,
  pinPost,
  createNotification,
} from "../db";
import type { ArchiveEnv } from "../utils/archive";
import type { CurrentUser } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import {
  PERM_CREATE_POST,
  PERM_COMMENT,
  PERM_PIN_POST,
} from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 帖子路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 字数上限 */
const LIMITS = {
  TITLE: 100,
  CONTENT: 1000,
  COMMENT: 300,
} as const;

// ============================================================
//  路由实例
// ============================================================

const postRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /  — 获取单个帖子（支持归档回退）
// ------------------------------------------------------------

postRoutes.get("/", async (c) => {
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

  const post = await getPostById(c.env.DB, id, user, archiveEnv);
  if (!post) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true, data: post });
});

// ------------------------------------------------------------
//  POST /  — 创建帖子
// ------------------------------------------------------------

postRoutes.post("/", requirePermission(PERM_CREATE_POST), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 5 帖
  const rate = checkRateLimit(user.id, "create_post", 3600, 5);
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
  const title = (body.title as string) ?? null;

  // 字数校验
  if (!content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "内容不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (title && title.length > LIMITS.TITLE) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `标题最多 ${LIMITS.TITLE} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (content.length > LIMITS.CONTENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `内容最多 ${LIMITS.CONTENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const cu = user as CurrentUser;
  const data = {
    authorId: user.id,
    title,
    content,
    visibility: (body.visibility as string) ?? undefined,
    blockId: (body.blockId as string) ?? undefined,
  };

  let id: string;

  if (data.visibility === "selected" && Array.isArray(body.visibleUserIds)) {
    id = await createPostWithVisibility(
      c.env.DB,
      { ...data, visibleUserIds: body.visibleUserIds as string[] },
      cu
    );
  } else {
    id = await createPost(c.env.DB, data, cu);
  }

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  PUT /  — 编辑帖子内容
// ------------------------------------------------------------

postRoutes.put("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  // 频率限制：每小时 20 次编辑
  const rate = checkRateLimit(user.id, "edit_post", 3600, 20);
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

  const id = body.id as string;
  const content = body.content as string;

  if (!id || !content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 或 content" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (content.length > LIMITS.CONTENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `内容最多 ${LIMITS.CONTENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await updatePostContent(c.env.DB, id, content, user);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  DELETE /  — 软删除帖子
// ------------------------------------------------------------

postRoutes.delete("/", async (c) => {
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

  const ok = await softDeletePost(c.env.DB, id, user);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  GET /comments  — 获取子评论列表
// ------------------------------------------------------------

postRoutes.get("/comments", async (c) => {
  const parentId = c.req.query("parentId");
  if (!parentId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 parentId 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const user = c.get("user");

  const comments = await listPostsByParent(c.env.DB, parentId, user, limit, offset);

  return c.json({ success: true, data: comments });
});

// ------------------------------------------------------------
//  POST /comment  — 创建评论
// ------------------------------------------------------------

postRoutes.post("/comment", requirePermission(PERM_COMMENT), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 20 条评论
  const rate = checkRateLimit(user.id, "comment", 3600, 20);
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

  const parentId = body.parentId as string;
  const content = (body.content as string) ?? "";

  if (!parentId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 parentId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "内容不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (content.length > LIMITS.COMMENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `评论最多 ${LIMITS.COMMENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = await createPost(c.env.DB, {
    parentId,
    authorId: user.id,
    content,
    authorVisible: (body.authorVisible as boolean) ?? true,
  }, user as CurrentUser);

  // --- 评论通知：查询父级作者并发送通知 ---
  const parent = await c.env.DB
    .prepare("SELECT authorId, parentId FROM post WHERE id = ?")
    .bind(parentId)
    .first<{ authorId: string; parentId: string | null }>();

  if (parent && parent.authorId !== user.id) {
    // 获取当前用户 username
    const profile = await c.env.DB
      .prepare("SELECT username FROM user_profile WHERE userId = ?")
      .bind(user.id)
      .first<{ username: string }>();
    const username = profile?.username ?? "用户";

    // 判断父级是帖子还是评论
    const isParentPost = !parent.parentId; // parentId 为 null = 顶级帖
    const targetType = isParentPost ? "post" : "comment";
    const targetLabel = isParentPost ? "帖子" : "评论";

    await createNotification(c.env.DB, {
      userId: parent.authorId,
      type: "comment",
      targetType,
      targetId: parentId,
      content: `${username} 评论了你的${targetLabel}`,
    });
  }

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  POST /pin  — 置顶 / 取消置顶
// ------------------------------------------------------------

postRoutes.post("/pin", requirePermission(PERM_PIN_POST), async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求体格式错误" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = body.id as string;
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const user = c.get("user");
  const ok = await pinPost(c.env.DB, id, user);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default postRoutes;
