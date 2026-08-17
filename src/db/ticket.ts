/**
 * 工单数据访问层
 *
 * 底层表：ticket
 * 规则：普通用户只能看自己的工单，有 view_ticket 权限可看全部。
 *
 * 工单类型：
 *   - permission_request  权限申请
 *   - report              举报（帖子/评论/表白墙）
 *   - appeal              申诉（封禁等处罚）
 *   - verification        认证申请
 *   - block_create        创建板块申请
 *   - account_deletion    账号注销申请
 *   - timeline_submit     大事记提交审核
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_VIEW_TICKET, PERM_HANDLE_TICKET } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  类型定义
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
  /** 举报目标类型（post / comment / confession） */
  targetType: string | null;
  /** 举报目标 ID */
  targetId: string | null;
  /** 扩展信息（JSON 字符串，如 eventDate） */
  extraData: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建工单的输入参数 */
export interface CreateTicketData {
  type: string;
  title: string;
  content: string;
  submittedBy: string;
  targetType?: string | null;
  targetId?: string | null;
  /** 扩展信息对象，写入时序列化为 JSON */
  extraData?: Record<string, unknown> | null;
}

/** ticket 表行结构（内部复用） */
interface TicketRow {
  id: string;
  type: string;
  title: string;
  content: string | null;
  status: string;
  submittedBy: string;
  assignedTo: string | null;
  result: string | null;
  targetType: string | null;
  targetId: string | null;
  extraData: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  写入函数
// ============================================================

/**
 * 创建工单
 *
 * @returns 新工单 ID
 */
export async function createTicket(
  db: D1Database,
  data: CreateTicketData
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO ticket (id, type, title, content, status, submittedBy, targetType, targetId, extraData, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.type,
      data.title,
      data.content,
      data.submittedBy,
      data.targetType ?? null,
      data.targetId ?? null,
      data.extraData ? JSON.stringify(data.extraData) : null,
      now,
      now
    )
    .run();

  return id;
}

// ============================================================
//  查询函数
// ============================================================

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

  const rows = await db.prepare(sql).bind(...params).all<TicketRow>();

  return rows.results;
}

/**
 * 按类型列出工单（管理视图）
 *
 * 供管理员按工单类型筛选，可按 status 过滤（null 表示全部）。
 */
export async function listTicketsByType(
  db: D1Database,
  type: string,
  status: string | null,
  limit: number,
  offset: number
): Promise<TicketInfo[]> {
  let sql: string;
  let params: unknown[];

  if (status) {
    sql = `SELECT * FROM ticket WHERE type = ? AND status = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params = [type, status, limit, offset];
  } else {
    sql = `SELECT * FROM ticket WHERE type = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    params = [type, limit, offset];
  }

  const rows = await db.prepare(sql).bind(...params).all<TicketRow>();

  return rows.results;
}

/**
 * 列出某用户自己提交的工单
 *
 * 按 createdAt 倒序。
 */
export async function getMyTickets(
  db: D1Database,
  userId: string,
  limit: number,
  offset: number
): Promise<TicketInfo[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM ticket WHERE submittedBy = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`
    )
    .bind(userId, limit, offset)
    .all<TicketRow>();

  return rows.results;
}

/**
 * 列出最近提交的工单（管理面板聚合信息用）
 *
 * 不做权限检查，由路由层确认 access_admin_panel 后调用。
 */
export async function getRecentTickets(
  db: D1Database,
  limit = 5
): Promise<TicketInfo[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  const rows = await db
    .prepare(`SELECT * FROM ticket ORDER BY createdAt DESC LIMIT ?`)
    .bind(safeLimit)
    .all<TicketRow>();

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
    .first<TicketRow>();

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
 * 需要 handle_ticket 权限。assignedTo 记录处理人。
 *
 * @returns false 表示无权限或工单不存在
 */
export async function updateTicketStatus(
  db: D1Database,
  id: string,
  status: string,
  result: string | null,
  assignedTo: string,
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
    .bind(status, result, assignedTo, now, id)
    .run();

  return true;
}
