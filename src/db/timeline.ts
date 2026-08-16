/**
 * 大事记数据访问层
 *
 * 底层表：timeline_event
 * 规则：只返回 status = 'approved' 的条目（未审核/被拒绝 → 404）。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_SUBMIT_TIMELINE, PERM_REVIEW_TIMELINE } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 大事记条目（仅 approved 状态对外可见） */
export interface TimelineEventInfo {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  submittedBy: string;
  createdAt: string;
}

/** 大事记条目（管理视图，含审核信息） */
export interface TimelineEventAdmin extends TimelineEventInfo {
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

// ============================================================
//  提交数据
// ============================================================

/** 提交大事记的输入参数 */
export interface SubmitTimelineData {
  title: string;
  description: string;
  eventDate: string;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 列出大事记（仅 approved）
 *
 * 按 eventDate 倒序排列。
 */
export async function listTimelineEvents(
  db: D1Database,
  _user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<TimelineEventInfo[]> {
  const rows = await db
    .prepare(
      `SELECT id, title, description, eventDate, submittedBy, createdAt
       FROM timeline_event WHERE status = 'approved'
       ORDER BY eventDate DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      submittedBy: string;
      createdAt: string;
    }>();

  return rows.results;
}

/**
 * 获取单条大事记
 *
 * status 必须为 'approved'，否则返回 null（404）。
 */
export async function getTimelineEventById(
  db: D1Database,
  id: string,
  _user: CurrentUser | null
): Promise<TimelineEventInfo | null> {
  const row = await db
    .prepare(
      `SELECT id, title, description, eventDate, submittedBy, createdAt
       FROM timeline_event WHERE id = ? AND status = 'approved'`
    )
    .bind(id)
    .first<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      submittedBy: string;
      createdAt: string;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventDate: row.eventDate,
    submittedBy: row.submittedBy,
    createdAt: row.createdAt,
  };
}

/**
 * 提交大事记（status = 'pending'）
 *
 * 需要 submit_timeline 权限。
 *
 * @returns 新大事记 ID，无权限返回 null
 */
export async function submitTimeline(
  db: D1Database,
  data: SubmitTimelineData,
  user: CurrentUser | null
): Promise<string | null> {
  if (!can(user, PERM_SUBMIT_TIMELINE)) return null;
  if (!user) return null;

  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO timeline_event (id, title, description, eventDate, status, submittedBy, createdAt)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(id, data.title, data.description, data.eventDate, user.id, now)
    .run();

  return id;
}

/**
 * 审核大事记
 *
 * 需要 review_timeline 权限。
 * 更新 status、reviewedBy、reviewedAt。
 *
 * @returns false 表示无权限或条目不存在
 */
export async function reviewTimeline(
  db: D1Database,
  id: string,
  status: "approved" | "rejected",
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_REVIEW_TIMELINE)) return false;
  if (!user) return false;

  const exists = await db
    .prepare("SELECT id FROM timeline_event WHERE id = ?")
    .bind(id)
    .first();

  if (!exists) return false;

  const now = nowISO();

  await db
    .prepare(
      "UPDATE timeline_event SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?"
    )
    .bind(status, user.id, now, id)
    .run();

  return true;
}
