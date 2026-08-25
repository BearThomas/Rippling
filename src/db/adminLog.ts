/**
 * 管理日志数据访问层
 *
 * 底层表：admin_log
 * 所有管理操作（权限修改、封禁/解封、工单处理等）统一通过
 * writeAdminLog 写入日志，日志完全公开可查（无需任何权限）。
 */

import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  类型定义
// ============================================================

/** 写管理日志的输入参数 */
export interface WriteAdminLogData {
  /** 执行操作的管理员 ID */
  adminId: string;
  /** 操作类型（如 edit_permissions / ban_user / handle_ticket） */
  action: string;
  /** 目标类型（user / ticket / post 等） */
  targetType: string;
  /** 目标 ID */
  targetId: string;
  /** 操作详情（JSON 字符串） */
  detail?: string;
}

/** 管理日志信息（完全公开，含管理员用户名） */
export interface AdminLogInfo {
  id: string;
  adminId: string;
  /** 管理员用户名；user_profile 不存在时为 null */
  adminUsername: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  createdAt: string;
}

/** 管理日志列表查询筛选条件 */
export interface AdminLogFilters {
  adminId?: string;
  action?: string;
  targetType?: string;
  /** 默认 50，最大 100 */
  limit?: number;
  offset?: number;
}

// ============================================================
//  写入函数
// ============================================================

/**
 * 写管理日志
 *
 * 参数化 INSERT 到 admin_log 表，createdAt 使用 nowISO()。
 */
export async function writeAdminLog(
  db: D1Database,
  data: WriteAdminLogData
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_log (id, adminId, action, targetType, targetId, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateUUID(),
      data.adminId,
      data.action,
      data.targetType,
      data.targetId,
      data.detail ?? null,
      nowISO()
    )
    .run();
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 列出管理日志（完全公开）
 *
 * 按 createdAt 倒序，支持按 adminId / action / targetType 筛选。
 * limit 默认 50，最大 100。
 *
 * 用户名解析：先查完整页日志，再用 IN 批量查 user_profile，
 * 避免 N+1；查不到的 adminId 对应 adminUsername = null。
 */
export async function listAdminLogs(
  db: D1Database,
  filters: AdminLogFilters = {}
): Promise<AdminLogInfo[]> {
  // 动态拼接筛选条件（全部参数化）
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.adminId) {
    conditions.push("adminId = ?");
    params.push(filters.adminId);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.targetType) {
    conditions.push("targetType = ?");
    params.push(filters.targetType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // 分页参数夹取：limit 默认 50，上限 100；offset 非负
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = await db
    .prepare(
      `SELECT id, adminId, action, targetType, targetId, detail, createdAt
       FROM admin_log ${where}
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<{
      id: string;
      adminId: string;
      action: string;
      targetType: string;
      targetId: string;
      detail: string | null;
      createdAt: string;
    }>();

  // 批量解析管理员用户名（去重后一次 IN 查询，避免 N+1）
  const adminIds = [...new Set(rows.results.map((r) => r.adminId))];
  const nameMap = new Map<string, string>();

  if (adminIds.length) {
    const placeholders = adminIds.map(() => "?").join(",");
    const profiles = await db
      .prepare(
        `SELECT userId, username FROM user_profile WHERE userId IN (${placeholders})`
      )
      .bind(...adminIds)
      .all<{ userId: string; username: string }>();

    for (const p of profiles.results) {
      nameMap.set(p.userId, p.username);
    }
  }

  return rows.results.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    adminUsername: nameMap.get(r.adminId) ?? null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    detail: r.detail,
    createdAt: r.createdAt,
  }));
}
