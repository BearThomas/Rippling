/**
 * 工单数据访问层
 *
 * 底层表：ticket
 * 规则：普通用户只能看自己的工单，有 view_ticket 权限可看全部。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_VIEW_TICKET, PERM_HANDLE_TICKET } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 工单信息 */
export interface TicketInfo {
  id: string;
  type: string;
  title: string;
  content: string | null;
  status: string;
  submittedBy: string;
  assignedTo: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  查询函数
// ============================================================

/** 创建工单 */
export async function createTicket(
  db: D1Database,
  type: string,
  title: string,
  content: string,
  submittedBy: string
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO ticket (id, type, title, content, status, submittedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`
    )
    .bind(id, type, title, content, submittedBy, now, now)
    .run();

  return id;
}

/**
 * 列出工单
 *
 * 普通用户只能看自己的；有 view_ticket 权限可看全部。
 */
export async function listTickets(
  db: D1Database,
  user: CurrentUser | null,
  status: string | null,
  limit: number,
  offset: number
): Promise<TicketInfo[]> {
  if (!user) return [];

  const hasViewAll = can(user, PERM_VIEW_TICKET);

  let sql: string;
  let params: unknown[];

  if (hasViewAll) {
    // 管理员：可看全部
    if (status) {
      sql = `SELECT * FROM ticket WHERE status = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
      params = [status, limit, offset];
    } else {
      sql = `SELECT * FROM ticket ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
      params = [limit, offset];
    }
  } else {
    // 普通用户：只看自己的
    if (status) {
      sql = `SELECT * FROM ticket WHERE submittedBy = ? AND status = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
      params = [user.id, status, limit, offset];
    } else {
      sql = `SELECT * FROM ticket WHERE submittedBy = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
      params = [user.id, limit, offset];
    }
  }

  const rows = await db
    .prepare(sql)
    .bind(...params)
    .all<{
      id: string;
      type: string;
      title: string;
      content: string | null;
      status: string;
      submittedBy: string;
      assignedTo: string | null;
      result: string | null;
      createdAt: string;
      updatedAt: string;
    }>();

  return rows.results;
}

/**
 * 获取单个工单
 *
 * 普通用户只能看自己的；有 view_ticket 权限可看任意工单。
 */
export async function getTicketById(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<TicketInfo | null> {
  if (!user) return null;

  const row = await db
    .prepare("SELECT * FROM ticket WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      type: string;
      title: string;
      content: string | null;
      status: string;
      submittedBy: string;
      assignedTo: string | null;
      result: string | null;
      createdAt: string;
      updatedAt: string;
    }>();

  if (!row) return null;

  // 权限检查：本人或有 view_ticket 权限
  const isOwner = row.submittedBy === user.id;
  const hasViewAll = can(user, PERM_VIEW_TICKET);

  if (!isOwner && !hasViewAll) return null;

  return row;
}

/**
 * 更新工单状态
 *
 * 需要 handle_ticket 权限。
 *
 * @returns false 表示无权限或工单不存在
 */
export async function updateTicketStatus(
  db: D1Database,
  id: string,
  status: string,
  result: string | null,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_HANDLE_TICKET)) return false;
  if (!user) return false;

  const exists = await db
    .prepare("SELECT id FROM ticket WHERE id = ?")
    .bind(id)
    .first();

  if (!exists) return false;

  const now = nowISO();

  await db
    .prepare("UPDATE ticket SET status = ?, result = ?, assignedTo = ?, updatedAt = ? WHERE id = ?")
    .bind(status, result, user.id, now, id)
    .run();

  return true;
}
