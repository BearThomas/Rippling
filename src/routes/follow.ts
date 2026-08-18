/**
 * 关注 API 路由
 *
 * 路由表（挂载前缀 /api/follow）：
 *   POST   /          关注用户
 *   DELETE /          取消关注
 *   GET    /status    查询关注状态
 *   GET    /following  关注列表
 *   GET    /followers  粉丝列表
 *
 * 关注为单向关系，无需对方同意。
 * 学号永不返回。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  followUser,
  unfollowUser,
  isFollowing,
  listFollowing,
  listFollowers,
  createNotification,
} from "../db";
import { PERM_FOLLOW_USER } from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 关注路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 关注列表中的用户信息 */
interface FollowUserInfo {
  id: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
  /** 头像 URL（user 表 image 字段，无头像为 null） */
  avatar: string | null;
  isFollowedByMe: boolean;
}

// ============================================================
//  辅助函数
// ============================================================

/**
 * 批量解析关注列表中的用户信息
 *
 * 从 user_profile 批量查询 username、nameColor、badge，
 * 左连接 user 表取头像（image 字段），
 * 并检查当前登录用户是否关注了列表中的每个用户。
 * 避免 N+1 查询。
 */
async function resolveFollowUsers(
  db: D1Database,
  userIds: string[],
  currentUserId: string | null
): Promise<FollowUserInfo[]> {
  if (!userIds.length) return [];

  // 批量查询用户资料（头像存于 Better Auth 的 user 表 image 字段，左连接一并查出）
  const placeholders = userIds.map(() => "?").join(",");
  const profiles = await db
    .prepare(
      `SELECT p.userId, p.username, p.nameColor, p.badge, u.image AS avatar
       FROM user_profile p
       LEFT JOIN user u ON u.id = p.userId
       WHERE p.userId IN (${placeholders})`
    )
    .bind(...userIds)
    .all<{
      userId: string;
      username: string;
      nameColor: string | null;
      badge: string | null;
      avatar: string | null;
    }>();

  const profileMap = new Map(profiles.results.map((p) => [p.userId, p]));

  // 批量检查当前用户的关注关系
  let followingSet = new Set<string>();
  if (currentUserId) {
    const followingRows = await db
      .prepare(
        `SELECT followingId FROM follow WHERE followerId = ? AND followingId IN (${placeholders})`
      )
      .bind(currentUserId, ...userIds)
      .all<{ followingId: string }>();

    followingSet = new Set(followingRows.results.map((r) => r.followingId));
  }

  // 组装结果（保持原始顺序）
  return userIds
    .filter((id) => profileMap.has(id))
    .map((id) => {
      const profile = profileMap.get(id)!;
      return {
        id: profile.userId,
        username: profile.username,
        nameColor: profile.nameColor,
        badge: profile.badge,
        avatar: profile.avatar,
        isFollowedByMe: followingSet.has(id),
      };
    });
}

// ============================================================
//  路由实例
// ============================================================

const followRoutes = new Hono<E>();

// ------------------------------------------------------------
//  POST /  — 关注用户
// ------------------------------------------------------------

followRoutes.post("/", requirePermission(PERM_FOLLOW_USER), async (c) => {
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

  const targetUserId = body.targetUserId as string;
  if (!targetUserId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetUserId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 不能关注自己
  if (targetUserId === user.id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "不能关注自己" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 检查目标用户是否存在
  const targetProfile = await c.env.DB
    .prepare("SELECT userId FROM user_profile WHERE userId = ?")
    .bind(targetUserId)
    .first();

  if (!targetProfile) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "用户不存在" } },
      NOT_FOUND.statusCode as any
    );
  }

  await followUser(c.env.DB, user.id, targetUserId);

  // --- 关注通知：通知被关注者 ---
  const profile = await c.env.DB
    .prepare("SELECT username FROM user_profile WHERE userId = ?")
    .bind(user.id)
    .first<{ username: string }>();
  const username = profile?.username ?? "用户";

  await createNotification(c.env.DB, {
    userId: targetUserId,
    type: "follow",
    targetType: "user",
    targetId: targetUserId,
    content: `${username} 关注了你`,
  });

  return c.json({ success: true, data: { following: true } });
});

// ------------------------------------------------------------
//  DELETE /  — 取消关注
// ------------------------------------------------------------

followRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  const targetUserId = c.req.query("targetUserId");
  if (!targetUserId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetUserId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  await unfollowUser(c.env.DB, user.id, targetUserId);

  return c.json({ success: true, data: { following: false } });
});

// ------------------------------------------------------------
//  GET /status  — 查询关注状态
// ------------------------------------------------------------

followRoutes.get("/status", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  const targetUserId = c.req.query("targetUserId");
  if (!targetUserId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 targetUserId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const following = await isFollowing(c.env.DB, user.id, targetUserId);

  return c.json({ success: true, data: { following } });
});

// ------------------------------------------------------------
//  GET /following  — 关注列表（公开接口）
// ------------------------------------------------------------

followRoutes.get("/following", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 userId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const currentUser = c.get("user");

  // 查询关注列表
  const records = await listFollowing(c.env.DB, userId, limit, offset);

  // 提取目标用户 ID 并批量解析
  const targetIds = records.map((r) => r.followingId);
  const users = await resolveFollowUsers(c.env.DB, targetIds, currentUser?.id ?? null);

  return c.json({ success: true, data: users });
});

// ------------------------------------------------------------
//  GET /followers  — 粉丝列表（公开接口）
// ------------------------------------------------------------

followRoutes.get("/followers", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 userId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const currentUser = c.get("user");

  // 查询粉丝列表
  const records = await listFollowers(c.env.DB, userId, limit, offset);

  // 提取粉丝用户 ID 并批量解析
  const followerIds = records.map((r) => r.followerId);
  const users = await resolveFollowUsers(c.env.DB, followerIds, currentUser?.id ?? null);

  return c.json({ success: true, data: users });
});

export default followRoutes;
