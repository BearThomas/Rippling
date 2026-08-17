/**
 * 通知数据访问层
 *
 * 设计原则：服务器只存未读通知，用户点击后前端调用删除接口。
 * 已读通知由前端本地存储，服务器不保留。
 *
 * 通知类型：
 *   - comment: 评论/回复通知
 *   - follow:  关注通知
 *   - system:  系统通知
 */

import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 通知信息 */
export interface NotificationInfo {
  id: string;
  type: string;
  targetType: string | null;
  targetId: string | null;
  content: string;
  createdAt: string;
}

/** 创建通知的参数 */
export interface CreateNotificationData {
  userId: string;
  type: "comment" | "follow" | "system";
  targetType?: string;
  targetId?: string;
  content: string;
}

// ============================================================
//  写入函数
// ============================================================

/**
 * 创建通知
 *
 * @returns 通知 ID
 */
export async function createNotification(
  db: D1Database,
  data: CreateNotificationData
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO notification (id, userId, type, targetType, targetId, content, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.userId,
      data.type,
      data.targetType ?? null,
      data.targetId ?? null,
      data.content,
      now
    )
    .run();

  return id;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 列出用户的所有未读通知（按时间倒序）
 */
export async function listUserNotifications(
  db: D1Database,
  userId: string
): Promise<NotificationInfo[]> {
  const rows = await db
    .prepare(
      `SELECT id, type, targetType, targetId, content, createdAt
       FROM notification
       WHERE userId = ?
       ORDER BY createdAt DESC`
    )
    .bind(userId)
    .all<{
      id: string;
      type: string;
      targetType: string | null;
      targetId: string | null;
      content: string;
      createdAt: string;
    }>();

  return rows.results.map((r) => ({
    id: r.id,
    type: r.type,
    targetType: r.targetType,
    targetId: r.targetId,
    content: r.content,
    createdAt: r.createdAt,
  }));
}

/**
 * 获取用户未读通知数量
 */
export async function getUnreadCount(
  db: D1Database,
  userId: string
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM notification WHERE userId = ?")
    .bind(userId)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

// ============================================================
//  删除函数
// ============================================================

/**
 * 删除通知（读后即删）
 *
 * 验证通知属于该 userId，防止越权删除。
 *
 * @returns false 表示通知不存在或不属于该用户
 */
export async function deleteNotification(
  db: D1Database,
  id: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM notification WHERE id = ? AND userId = ?")
    .bind(id, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
