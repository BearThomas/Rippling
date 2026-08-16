/**
 * 表白墙数据访问层
 *
 * 底层表：confession, archive_operation
 * 安全规则：authorId 永远不直接返回，仅 view_anonymous_identity 权限可单独查身份。
 *
 * 事件溯源设计（方案 B）：
 *   - 删除操作加 isDeleted 标记，不物理删除
 *   - archive_operation 表存储完整操作链，用于归档和追责
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_DELETE_OTHERS_POST, PERM_VIEW_ANONYMOUS_IDENTITY } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 表白墙条目（不含作者身份） */
export interface ConfessionInfo {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** 表白墙条目（含作者，仅 view_anonymous_identity 权限可获取） */
export interface ConfessionInfoWithAuthor extends ConfessionInfo {
  authorId: string;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 获取单条表白墙内容
 *
 * 默认不返回 authorId。
 * 仅当用户有 view_anonymous_identity 权限时返回含作者信息的版本。
 */
export async function getConfessionById(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<ConfessionInfo | ConfessionInfoWithAuthor | null> {
  const row = await db
    .prepare("SELECT id, authorId, content, createdAt, updatedAt FROM confession WHERE id = ? AND isDeleted = 0")
    .bind(id)
    .first<{
      id: string;
      authorId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>();

  if (!row) return null;

  // 有匿名查看权限 → 返回作者
  if (can(user, PERM_VIEW_ANONYMOUS_IDENTITY)) {
    return {
      id: row.id,
      authorId: row.authorId,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 列出表白墙条目（按时间倒序） */
export async function listConfessions(
  db: D1Database,
  _user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<ConfessionInfo[]> {
  const rows = await db
    .prepare(
      "SELECT id, content, createdAt, updatedAt FROM confession WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    )
    .bind(limit, offset)
    .all<{
      id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>();

  return rows.results;
}

/** 发布表白墙条目 */
export async function createConfession(
  db: D1Database,
  authorId: string,
  content: string
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      "INSERT INTO confession (id, authorId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, authorId, content, now, now)
    .run();

  return id;
}

/**
 * 软删除表白墙条目
 *
 * 需要 delete_others_post 权限。在 archive_operation 表记录 delete 操作。
 *
 * @returns false 表示无权限或条目不存在
 */
export async function softDeleteConfession(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_DELETE_OTHERS_POST)) return false;
  if (!user) return false;

  const exists = await db
    .prepare("SELECT id, isDeleted FROM confession WHERE id = ?")
    .bind(id)
    .first<{ id: string; isDeleted: number }>();

  if (!exists || exists.isDeleted) return false;

  const now = nowISO();

  // 事件溯源：记录删除操作到操作链
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'confession', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, now)
    .run();

  // 同时标记删除（不物理删除）
  await db
    .prepare("UPDATE confession SET isDeleted = 1, updatedAt = ? WHERE id = ?")
    .bind(now, id)
    .run();

  return true;
}
