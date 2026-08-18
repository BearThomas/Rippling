/**
 * 用户 API 路由
 *
 * 路由表（挂载前缀 /api/user）：
 *   GET  /profile    用户公开资料（游客可见，不存在 → 404）
 *   GET  /posts      用户的帖子列表（公开，带权限过滤 + enrichment）
 *   GET  /comments   用户的评论列表（公开，带权限过滤 + enrichment）
 *   PUT  /username   修改用户名（modify_own_username，每月最多 4 次）
 *   PUT  /avatar     修改头像（登录即可，URL 写入 user.image）
 *   POST /password   修改密码（modify_password，Better Auth changePassword）
 *
 * 敏感信息（学号 / email / permissions）不在本模块返回。
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { CloudflareEnv } from "../auth";
import { createAuth } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { PERM_MODIFY_OWN_USERNAME, PERM_MODIFY_PASSWORD } from "../shared/permissions";
import { UNAUTHORIZED, VALIDATION_ERROR, NOT_FOUND, RATE_LIMITED } from "../utils/errors";
import {
  getUserPublicProfile,
  userExists,
  updateUsername,
  countRecentUsernameChanges,
  updateAvatar,
  listUserPosts,
  listUserComments,
  enrichPosts,
} from "../db";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  类型定义与常量
// ============================================================

type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 用户名合法字符：中文、字母、数字、下划线 */
const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]+$/;
/** 用户名长度限制 */
const USERNAME_MIN = 1;
const USERNAME_MAX = 50;
/** 每月（30 天）改名次数上限 */
const USERNAME_CHANGE_LIMIT = 4;
/** 头像 URL 长度上限（防超长输入） */
const AVATAR_URL_MAX = 500;

/**
 * 头像 URL 合法性判断
 *
 * 接受两种形式：
 *   1. http(s) 绝对 URL（兼容历史数据 / 外链头像）
 *   2. 同域图片代理地址 /api/image?key=...（B2 私有 Bucket 上传后的返回地址，
 *      key 经 encodeURIComponent 编码，此处解码后按与图片代理一致的规则校验）
 */
function isValidAvatarUrl(url: string): boolean {
  if (/^https?:\/\/.+/.test(url)) return true;

  if (!url.startsWith("/api/image?key=")) return false;
  try {
    const key = decodeURIComponent(url.slice("/api/image?key=".length));
    return key.startsWith("images/") && !key.includes("..") && !key.includes("\\");
  } catch {
    // 非法的百分号编码序列
    return false;
  }
}

const userRoutes = new Hono<E>();

// ============================================================
//  内部辅助
// ============================================================

/** 统一 400 响应 */
function badRequest(c: Context<E>, message: string) {
  return c.json(
    { success: false, error: { code: VALIDATION_ERROR.code, message } },
    VALIDATION_ERROR.statusCode as any
  );
}

/** 统一 404 响应 */
function notFound(c: Context<E>, message = "用户不存在") {
  return c.json(
    { success: false, error: { code: NOT_FOUND.code, message } },
    NOT_FOUND.statusCode as any
  );
}

/** 解析分页参数（limit 1-50，默认 20；offset >= 0） */
function parsePagination(c: Context<E>): { limit: number; offset: number } {
  const rawLimit = parseInt(c.req.query("limit") ?? "", 10);
  const rawOffset = parseInt(c.req.query("offset") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { limit, offset };
}

// ============================================================
//  GET /profile  — 用户公开资料（游客可见）
// ============================================================

userRoutes.get("/profile", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) return badRequest(c, "缺少 userId 参数");

  const profile = await getUserPublicProfile(c.env.DB, userId, c.get("user"));
  if (!profile) return notFound(c);

  return c.json({ success: true, data: profile });
});

// ============================================================
//  GET /posts  — 用户的帖子列表（公开 + 权限过滤 + enrichment）
// ============================================================

userRoutes.get("/posts", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) return badRequest(c, "缺少 userId 参数");

  // 用户不存在 → 404（零信任：与无权访问同表现）
  if (!(await userExists(c.env.DB, userId))) return notFound(c);

  const { limit, offset } = parsePagination(c);
  const posts = await listUserPosts(c.env.DB, userId, c.get("user"), limit, offset);
  // 附加作者信息 / 点赞数 / 评论数 / liked（批量查询，无 N+1）
  const enriched = await enrichPosts(c.env.DB, posts, c.get("user"));

  return c.json({ success: true, data: { posts: enriched, total: enriched.length } });
});

// ============================================================
//  GET /comments  — 用户的评论列表（公开 + 权限过滤 + enrichment）
// ============================================================

userRoutes.get("/comments", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) return badRequest(c, "缺少 userId 参数");

  if (!(await userExists(c.env.DB, userId))) return notFound(c);

  const { limit, offset } = parsePagination(c);
  const comments = await listUserComments(c.env.DB, userId, c.get("user"), limit, offset);
  const enriched = await enrichPosts(c.env.DB, comments, c.get("user"));

  return c.json({ success: true, data: { comments: enriched, total: enriched.length } });
});

// ============================================================
//  PUT /username  — 修改用户名（每月最多 4 次）
// ============================================================

userRoutes.put("/username", requirePermission(PERM_MODIFY_OWN_USERNAME), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";

  // 长度校验
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return badRequest(c, `用户名长度需在 ${USERNAME_MIN}-${USERNAME_MAX} 字之间`);
  }
  // 字符校验：仅中文、字母、数字、下划线
  if (!USERNAME_PATTERN.test(username)) {
    return badRequest(c, "用户名只能包含中文、字母、数字和下划线");
  }

  // 频率校验：最近 30 天内 >= 4 次则拒绝
  const recentCount = await countRecentUsernameChanges(c.env.DB, user.id);
  if (recentCount >= USERNAME_CHANGE_LIMIT) {
    return c.json(
      { success: false, error: { code: RATE_LIMITED.code, message: "每月最多修改 4 次用户名" } },
      RATE_LIMITED.statusCode as any
    );
  }

  // 唯一性校验 + 更新 + 写 user_log（updateUsername 内部完成）
  const ok = await updateUsername(c.env.DB, user.id, username);
  if (!ok) return badRequest(c, "用户名已被占用");

  return c.json({ success: true, data: { username } });
});

// ============================================================
//  PUT /avatar  — 修改头像（登录即可）
// ============================================================

userRoutes.put("/avatar", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: UNAUTHORIZED.code, message: UNAUTHORIZED.message } },
      UNAUTHORIZED.statusCode as any
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";

  // URL 校验：接受 http(s) 绝对 URL 或 /api/image 代理地址（前端一般先经 /api/upload/image 上传）
  if (!avatarUrl || avatarUrl.length > AVATAR_URL_MAX || !isValidAvatarUrl(avatarUrl)) {
    return badRequest(c, "头像地址无效，需为 http/https URL 或 /api/image 代理地址");
  }

  const ok = await updateAvatar(c.env.DB, user.id, avatarUrl);
  if (!ok) return notFound(c);

  return c.json({ success: true, data: { avatarUrl } });
});

// ============================================================
//  POST /password  — 修改密码（Better Auth changePassword）
// ============================================================

userRoutes.post("/password", requirePermission(PERM_MODIFY_PASSWORD), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) return badRequest(c, "请输入当前密码");
  if (newPassword.length < 8) return badRequest(c, "新密码至少 8 位");

  // Better Auth 的 changePassword 内部会校验当前密码并更新哈希；
  // 当前密码错误 / 其他异常时抛出，统一降级为 400
  try {
    const auth = createAuth(c.env);
    await auth.api.changePassword({
      body: { currentPassword, newPassword },
      headers: c.req.raw.headers,
    });
  } catch (err) {
    console.error("[User] changePassword failed:", err);
    return badRequest(c, "当前密码不正确或修改失败");
  }

  // 审计日志（不记录任何密码内容）
  await c.env.DB.prepare(
    "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'change_password', ?, ?)"
  )
    .bind(generateUUID(), user.id, "{}", nowISO())
    .run();

  return c.json({ success: true });
});

export default userRoutes;
