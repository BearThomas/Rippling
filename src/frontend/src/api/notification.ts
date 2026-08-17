/**
 * 通知 API（/api/notification）
 *
 * 服务器只存未读通知，读取列表后由前端展示，删除即标记已读。
 */

import { apiGet, apiDelete } from "./client";
import type { NotificationInfo } from "../types";

/** 未读通知列表 */
export function listNotifications(): Promise<NotificationInfo[]> {
  return apiGet<NotificationInfo[]>("/api/notification/list", {
    silentError: true,
  });
}

/** 未读数量（轮询红点用） */
export function getUnreadCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>("/api/notification/unread-count", {
    silentError: true,
  });
}

/** 删除通知（单条 id，或省略 id 清空全部） */
export function deleteNotification(id?: string): Promise<void> {
  return apiDelete<void>("/api/notification", { body: { id } });
}
