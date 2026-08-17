/**
 * 用户资料数据访问层
 *
 * 底层表：user_profile, user_log, admin_log
 * 字段过滤：学号（studentId）仅本人或有 view_database 权限可见。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_VIEW_DATABASE, PERM_EDIT_OTHERS_PERMISSION } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

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
