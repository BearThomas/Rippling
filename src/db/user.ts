/**
 * 用户资料数据访问层
 *
 * 底层表：user_profile, user_log, admin_log
 * 字段过滤：学号（studentId）仅本人或有 view_database 权限可见。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import {
  PERM_VIEW_DATABASE,
  PERM_EDIT_OTHERS_PERMISSION,
  DEFAULT_USER_PERMISSIONS,
  MASK_VIEW_SITE,
} from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import { writeAdminLog } from "./adminLog";

// ============================================================
//  返回类型
// ============================================================

/** 公开用户资料（不含敏感字段） */
export interface PublicUserProfile {
  userId: string;
  username: string;
  /** 昵称颜色 */
  nameColor: string | null;
  /** 徽章 */
  badge: string | null;
  /** 提问箱是否启用 */
  questionBoxEnabled: boolean;
  /** 关注数 */
  followingCount: number;
  /** 粉丝数 */
  followerCount: number;
  createdAt: string;
}

/** 含敏感字段用户资料（仅本人或有权限者可见） */
export interface FullUserProfile extends PublicUserProfile {
  studentId: string | null;
  permissions: bigint;
  violationCount: number;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 获取用户资料（带字段过滤）
 *
 * - 学号（studentId）仅本人或有 view_database 权限时返回
 * - 同时查询关注数 / 粉丝数
 */
export async function getUserProfileById(
  db: D1Database,
  userId: string,
  user: CurrentUser | null
): Promise<PublicUserProfile | FullUserProfile | null> {
  const row = await db
    .prepare(
      `SELECT userId, studentId, username, permissions, nameColor, badge,
              questionBoxEnabled, violationCount, createdAt
       FROM user_profile WHERE userId = ?`
    )
    .bind(userId)
    .first<{
      userId: string;
      studentId: string | null;
      username: string;
      permissions: number;
      nameColor: string | null;
      badge: string | null;
      questionBoxEnabled: number;
      violationCount: number;
      createdAt: string;
    }>();

  if (!row) return null;

  // 查询关注数 / 粉丝数
  const followingRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followerId = ?")
    .bind(userId)
    .first<{ count: number }>();

  const followerRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followingId = ?")
    .bind(userId)
    .first<{ count: number }>();

  const isSelf = user?.id === userId;
  const hasDbView = can(user, PERM_VIEW_DATABASE);

  const base: PublicUserProfile = {
    userId: row.userId,
    username: row.username,
    nameColor: row.nameColor,
    badge: row.badge,
    questionBoxEnabled: !!row.questionBoxEnabled,
    followingCount: followingRow?.count ?? 0,
    followerCount: followerRow?.count ?? 0,
    createdAt: row.createdAt,
  };

  // 本人或有 view_database 权限 → 返回完整信息
  if (isSelf || hasDbView) {
    return {
      ...base,
      studentId: row.studentId,
      permissions: BigInt(row.permissions),
      violationCount: row.violationCount,
    } as FullUserProfile;
  }

  return base;
}

/**
 * 通过用户名查找用户（仅返回公开信息）
 *
 * 供搜索功能使用，不返回学号等敏感字段。
 */
export async function getUserProfileByUsername(
  db: D1Database,
  username: string
): Promise<PublicUserProfile | null> {
  const row = await db
    .prepare(
      `SELECT userId, username, nameColor, badge, questionBoxEnabled, createdAt
       FROM user_profile WHERE username = ?`
    )
    .bind(username)
    .first<{
      userId: string;
      username: string;
      nameColor: string | null;
      badge: string | null;
      questionBoxEnabled: number;
      createdAt: string;
    }>();

  if (!row) return null;

  const followingRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followerId = ?")
    .bind(row.userId)
    .first<{ count: number }>();

  const followerRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followingId = ?")
    .bind(row.userId)
    .first<{ count: number }>();

  return {
    userId: row.userId,
    username: row.username,
    nameColor: row.nameColor,
    badge: row.badge,
    questionBoxEnabled: !!row.questionBoxEnabled,
    followingCount: followingRow?.count ?? 0,
    followerCount: followerRow?.count ?? 0,
    createdAt: row.createdAt,
  };
}

// ============================================================
//  公开用户主页（含头像与关注关系）
// ============================================================

/** 用户公开资料（比 PublicUserProfile 多头像与关注关系） */
export interface UserPublicProfile extends PublicUserProfile {
  /** 头像 URL（user 表 image 字段） */
  avatar: string | null;
  /** 当前用户是否关注了 TA（游客为 false） */
  isFollowedByMe: boolean;
}

/**
 * 获取用户公开资料（游客可见）
 *
 * 不返回 studentId / email / permissions 等敏感信息；
 * 头像取自 Better Auth 的 user 表 image 字段。
 *
 * @returns 用户不存在返回 null
 */
export async function getUserPublicProfile(
  db: D1Database,
  userId: string,
  currentUser: CurrentUser | null
): Promise<UserPublicProfile | null> {
  // user_profile 与 user 表左连接，一次查出基础资料 + 头像
  const row = await db
    .prepare(
      `SELECT p.userId, p.username, p.nameColor, p.badge, p.questionBoxEnabled,
              p.createdAt, u.image AS avatar
       FROM user_profile p
       LEFT JOIN user u ON u.id = p.userId
       WHERE p.userId = ?`
    )
    .bind(userId)
    .first<{
      userId: string;
      username: string;
      nameColor: string | null;
      badge: string | null;
      questionBoxEnabled: number;
      createdAt: string;
      avatar: string | null;
    }>();

  if (!row) return null;

  // 关注数：TA 关注了多少人（followerId = TA）
  const followingRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followerId = ?")
    .bind(userId)
    .first<{ count: number }>();

  // 粉丝数：多少人关注了 TA（followingId = TA）
  const followerRow = await db
    .prepare("SELECT COUNT(*) as count FROM follow WHERE followingId = ?")
    .bind(userId)
    .first<{ count: number }>();

  // 当前用户是否关注了 TA
  let isFollowedByMe = false;
  if (currentUser && currentUser.id !== userId) {
    const rel = await db
      .prepare("SELECT id FROM follow WHERE followerId = ? AND followingId = ?")
      .bind(currentUser.id, userId)
      .first();
    isFollowedByMe = !!rel;
  }

  return {
    userId: row.userId,
    username: row.username,
    nameColor: row.nameColor,
    badge: row.badge,
    avatar: row.avatar,
    questionBoxEnabled: !!row.questionBoxEnabled,
    followingCount: followingRow?.count ?? 0,
    followerCount: followerRow?.count ?? 0,
    isFollowedByMe,
    createdAt: row.createdAt,
  };
}

/** 检查用户是否存在（供路由层 404 判断） */
export async function userExists(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT userId FROM user_profile WHERE userId = ?")
    .bind(userId)
    .first();
  return !!row;
}

/**
 * 修改用户名
 *
 * 检查新用户名的唯一性，更新后记录到 user_log。
 *
 * @returns false 表示用户名已存在
 */
export async function updateUsername(
  db: D1Database,
  userId: string,
  newUsername: string
): Promise<boolean> {
  // 检查唯一性
  const existing = await db
    .prepare("SELECT userId FROM user_profile WHERE username = ? AND userId != ?")
    .bind(newUsername, userId)
    .first();

  if (existing) return false;

  // 读取旧用户名用于日志
  const oldRow = await db
    .prepare("SELECT username FROM user_profile WHERE userId = ?")
    .bind(userId)
    .first<{ username: string }>();

  const now = nowISO();

  await db
    .prepare("UPDATE user_profile SET username = ?, updatedAt = ? WHERE userId = ?")
    .bind(newUsername, now, userId)
    .run();

  // 记录到 user_log
  await db
    .prepare(
      "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'change_username', ?, ?)"
    )
    .bind(
      generateUUID(),
      userId,
      JSON.stringify({ from: oldRow?.username ?? "", to: newUsername }),
      now
    )
    .run();

  return true;
}

/**
 * 统计最近 N 天内的改名次数
 *
 * 用于用户名修改频率限制（每月 4 次）。
 * createdAt 为 ISO 8601 字符串，字典序比较安全。
 */
export async function countRecentUsernameChanges(
  db: D1Database,
  userId: string,
  days = 30
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM user_log
       WHERE userId = ? AND action = 'change_username' AND createdAt >= ?`
    )
    .bind(userId, since)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

/**
 * 修改用户头像
 *
 * 头像 URL 存入 Better Auth 的 user 表 image 字段，
 * 并记录到 user_log（不存储旧值，只记录新 URL）。
 *
 * @returns false 表示用户不存在
 */
export async function updateAvatar(
  db: D1Database,
  userId: string,
  avatarUrl: string
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user SET image = ?, updatedAt = ? WHERE id = ?")
    .bind(avatarUrl, now, userId)
    .run();

  if (!result.meta.changes) return false;

  await db
    .prepare(
      "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'change_avatar', ?, ?)"
    )
    .bind(generateUUID(), userId, JSON.stringify({ avatarUrl }), now)
    .run();

  return true;
}

/**
 * 修改用户权限（管理员操作）
 *
 * 需要 edit_others_permission 权限。操作记录到 admin_log。
 *
 * @returns false 表示当前用户无权限
 */
export async function updatePermissions(
  db: D1Database,
  targetUserId: string,
  newPermissions: bigint,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_EDIT_OTHERS_PERMISSION)) return false;
  if (!user) return false;

  const now = nowISO();

  await db
    .prepare("UPDATE user_profile SET permissions = ?, updatedAt = ? WHERE userId = ?")
    .bind(Number(newPermissions), now, targetUserId)
    .run();

  // 记录到 admin_log
  await db
    .prepare(
      `INSERT INTO admin_log (id, adminId, action, targetType, targetId, detail, createdAt)
       VALUES (?, ?, 'update_permissions', 'user', ?, ?, ?)`
    )
    .bind(
      generateUUID(),
      user.id,
      targetUserId,
      String(newPermissions),
      now
    )
    .run();

  return true;
}

// ============================================================
//  账号注销
// ============================================================

/**
 * 注销用户账号
 *
 * 设置 isDeactivated = 1（学号保留，UNIQUE 约束阻止重新注册），
 * 并记录到 user_log。注销后 auth 中间件会拒绝登录。
 *
 * @returns false 表示用户不存在
 */
export async function deactivateUser(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET isDeactivated = 1, updatedAt = ? WHERE userId = ?")
    .bind(now, userId)
    .run();

  if (!result.meta.changes) return false;

  // 记录到 user_log
  await db
    .prepare(
      "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'deactivate_account', ?, ?)"
    )
    .bind(generateUUID(), userId, JSON.stringify({ isDeactivated: 1 }), now)
    .run();

  return true;
}

/**
 * 恢复用户账号（申诉通过时用）
 *
 * 设置 isDeactivated = 0，并记录到 user_log。
 *
 * @returns false 表示用户不存在
 */
export async function reactivateUser(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET isDeactivated = 0, updatedAt = ? WHERE userId = ?")
    .bind(now, userId)
    .run();

  if (!result.meta.changes) return false;

  // 记录到 user_log
  await db
    .prepare(
      "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'reactivate_account', ?, ?)"
    )
    .bind(generateUUID(), userId, JSON.stringify({ isDeactivated: 0 }), now)
    .run();

  return true;
}

// ============================================================
//  违规次数
// ============================================================

/**
 * 违规次数 +1
 *
 * @returns 新的违规次数；用户不存在返回 -1
 */
export async function incrementViolationCount(
  db: D1Database,
  userId: string
): Promise<number> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET violationCount = violationCount + 1, updatedAt = ? WHERE userId = ?")
    .bind(now, userId)
    .run();

  if (!result.meta.changes) return -1;

  const row = await db
    .prepare("SELECT violationCount FROM user_profile WHERE userId = ?")
    .bind(userId)
    .first<{ violationCount: number }>();

  return row?.violationCount ?? -1;
}

/**
 * 重置违规次数为 0
 *
 * @returns false 表示用户不存在
 */
export async function resetViolationCount(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET violationCount = 0, updatedAt = ? WHERE userId = ?")
    .bind(now, userId)
    .run();

  return result.meta.changes > 0;
}

/**
 * 获取用户违规次数
 *
 * @returns 用户不存在返回 0
 */
export async function getUserViolationCount(
  db: D1Database,
  userId: string
): Promise<number> {
  const row = await db
    .prepare("SELECT violationCount FROM user_profile WHERE userId = ?")
    .bind(userId)
    .first<{ violationCount: number }>();

  return row?.violationCount ?? 0;
}

// ============================================================
//  工单系统专用权限操作
// ============================================================

/**
 * 直接设置用户权限掩码（不检查 edit_others_permission）
 *
 * 仅由工单处理流程调用（权限申请批准 / 申诉恢复 / 举报封禁），
 * 调用方已具备 handle_ticket 权限，并由路由层统一写 admin_log。
 *
 * @returns false 表示用户不存在
 */
export async function setUserPermissionsDirect(
  db: D1Database,
  userId: string,
  permissions: bigint
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET permissions = ?, updatedAt = ? WHERE userId = ?")
    .bind(Number(permissions), now, userId)
    .run();

  return result.meta.changes > 0;
}

/**
 * 读取用户当前权限掩码
 *
 * @returns 用户不存在返回 null
 */
export async function getUserPermissions(
  db: D1Database,
  userId: string
): Promise<bigint | null> {
  const row = await db
    .prepare("SELECT permissions FROM user_profile WHERE userId = ?")
    .bind(userId)
    .first<{ permissions: number }>();

  return row ? BigInt(row.permissions) : null;
}

/**
 * 修改用户昵称颜色（认证通过时用）
 *
 * @returns false 表示用户不存在
 */
export async function updateUserNameColor(
  db: D1Database,
  userId: string,
  nameColor: string
): Promise<boolean> {
  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET nameColor = ?, updatedAt = ? WHERE userId = ?")
    .bind(nameColor, now, userId)
    .run();

  return result.meta.changes > 0;
}

// ============================================================
//  管理面板 — 用户管理
//
//  查询类函数不内置权限检查，由路由层确认 access_admin_panel 后调用；
//  写操作内置 edit_others_permission 检查并统一写 admin_log。
// ============================================================

/** 用户管理信息（含敏感字段，仅管理员可见） */
export interface AdminUserInfo {
  id: string;
  username: string;
  /** 学号（仅管理员可见） */
  studentId: string | null;
  permissions: bigint;
  nameColor: string | null;
  badge: string | null;
  violationCount: number;
  isDeactivated: boolean;
  createdAt: string;
}

/** user_profile 管理视图行结构 */
interface AdminUserRow {
  userId: string;
  username: string;
  studentId: string | null;
  permissions: number;
  nameColor: string | null;
  badge: string | null;
  violationCount: number;
  isDeactivated: number | null;
  createdAt: string;
}

/** 行 → AdminUserInfo 转换 */
function toAdminUserInfo(row: AdminUserRow): AdminUserInfo {
  return {
    id: row.userId,
    username: row.username,
    studentId: row.studentId,
    permissions: BigInt(row.permissions),
    nameColor: row.nameColor,
    badge: row.badge,
    violationCount: row.violationCount,
    isDeactivated: !!row.isDeactivated,
    createdAt: row.createdAt,
  };
}

/**
 * 转义 LIKE 通配符
 *
 * 防止用户输入的 % / _ 被当作通配符，配合 ESCAPE '\' 使用。
 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * 获取用户管理信息
 *
 * @returns 用户不存在返回 null
 */
export async function getAdminUserInfo(
  db: D1Database,
  userId: string
): Promise<AdminUserInfo | null> {
  const row = await db
    .prepare(
      `SELECT userId, username, studentId, permissions, nameColor, badge,
              violationCount, isDeactivated, createdAt
       FROM user_profile WHERE userId = ?`
    )
    .bind(userId)
    .first<AdminUserRow>();

  if (!row) return null;

  return toAdminUserInfo(row);
}

/**
 * 列出用户（管理视图）
 *
 * 可按 username 或 studentId 模糊搜索，按 createdAt 倒序。
 */
export async function listUsersForAdmin(
  db: D1Database,
  search: string | undefined,
  limit: number,
  offset: number
): Promise<AdminUserInfo[]> {
  let sql: string;
  let params: unknown[];

  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    sql = `SELECT userId, username, studentId, permissions, nameColor, badge,
                  violationCount, isDeactivated, createdAt
           FROM user_profile
           WHERE username LIKE ? ESCAPE '\\' OR studentId LIKE ? ESCAPE '\\'
           ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params = [pattern, pattern, limit, offset];
  } else {
    sql = `SELECT userId, username, studentId, permissions, nameColor, badge,
                  violationCount, isDeactivated, createdAt
           FROM user_profile
           ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params = [limit, offset];
  }

  const rows = await db.prepare(sql).bind(...params).all<AdminUserRow>();

  return rows.results.map(toAdminUserInfo);
}

/**
 * 修改用户权限（管理面板）
 *
 * 需要 edit_others_permission 权限，操作记录到 admin_log。
 *
 * @returns false 表示无权限或用户不存在
 */
export async function setUserPermissions(
  db: D1Database,
  userId: string,
  permissions: bigint,
  adminUser: CurrentUser | null
): Promise<boolean> {
  if (!can(adminUser, PERM_EDIT_OTHERS_PERMISSION)) return false;
  if (!adminUser) return false;

  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET permissions = ?, updatedAt = ? WHERE userId = ?")
    .bind(Number(permissions), now, userId)
    .run();

  if (!result.meta.changes) return false;

  await writeAdminLog(db, {
    adminId: adminUser.id,
    action: "edit_permissions",
    targetType: "user",
    targetId: userId,
    detail: JSON.stringify({ permissions: String(permissions) }),
  });

  return true;
}

/**
 * 封禁用户：权限掩码清零，只保留 view_site
 *
 * 需要 edit_others_permission 权限，操作记录到 admin_log。
 *
 * @returns false 表示无权限或用户不存在
 */
export async function banUser(
  db: D1Database,
  userId: string,
  adminUser: CurrentUser | null
): Promise<boolean> {
  if (!can(adminUser, PERM_EDIT_OTHERS_PERMISSION)) return false;
  if (!adminUser) return false;

  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET permissions = ?, updatedAt = ? WHERE userId = ?")
    .bind(Number(MASK_VIEW_SITE), now, userId)
    .run();

  if (!result.meta.changes) return false;

  await writeAdminLog(db, {
    adminId: adminUser.id,
    action: "ban_user",
    targetType: "user",
    targetId: userId,
    detail: JSON.stringify({ permissions: String(MASK_VIEW_SITE) }),
  });

  return true;
}

/**
 * 解封用户：恢复注册用户默认权限（DEFAULT_USER_PERMISSIONS）
 *
 * 需要 edit_others_permission 权限，操作记录到 admin_log。
 *
 * @returns false 表示无权限或用户不存在
 */
export async function unbanUser(
  db: D1Database,
  userId: string,
  adminUser: CurrentUser | null
): Promise<boolean> {
  if (!can(adminUser, PERM_EDIT_OTHERS_PERMISSION)) return false;
  if (!adminUser) return false;

  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET permissions = ?, updatedAt = ? WHERE userId = ?")
    .bind(Number(DEFAULT_USER_PERMISSIONS), now, userId)
    .run();

  if (!result.meta.changes) return false;

  await writeAdminLog(db, {
    adminId: adminUser.id,
    action: "unban_user",
    targetType: "user",
    targetId: userId,
    detail: JSON.stringify({ permissions: String(DEFAULT_USER_PERMISSIONS) }),
  });

  return true;
}

/**
 * 重置用户违规次数为 0
 *
 * 需要 edit_others_permission 权限，操作记录到 admin_log。
 *
 * @returns false 表示无权限或用户不存在
 */
export async function resetUserViolations(
  db: D1Database,
  userId: string,
  adminUser: CurrentUser | null
): Promise<boolean> {
  if (!can(adminUser, PERM_EDIT_OTHERS_PERMISSION)) return false;
  if (!adminUser) return false;

  const now = nowISO();

  const result = await db
    .prepare("UPDATE user_profile SET violationCount = 0, updatedAt = ? WHERE userId = ?")
    .bind(now, userId)
    .run();

  if (!result.meta.changes) return false;

  await writeAdminLog(db, {
    adminId: adminUser.id,
    action: "reset_violations",
    targetType: "user",
    targetId: userId,
  });

  return true;
}
