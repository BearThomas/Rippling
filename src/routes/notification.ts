/**
 * 通知 API 路由
 *
 * 路由表（挂载前缀 /api/notification）：
 *   GET    /list         获取未读通知列表
 *   GET    /unread-count 获取未读通知数量
 *   DELETE /             删除通知（读后即删）
 *
 * 设计原则：
 *   - 服务器只存未读通知，用户点击后前端调用删除接口
 *   - 已读通知由前端本地存储，服务器不保留
 *   - 所有接口需要登录
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import {
  listUserNotifications,
  getUnreadCount,
  deleteNotification,
} from "../db";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 通知路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

// ============================================================
//  路由实例
// ============================================================

const notificationRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /list  — 获取未读通知列表
// ------------------------------------------------------------

notificationRoutes.get("/list", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  const notifications = await listUserNotifications(c.env.DB, user.id);

  return c.json({ success: true, data: notifications });
});

// ------------------------------------------------------------
//  GET /unread-count  — 获取未读通知数量
// ------------------------------------------------------------

notificationRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  const count = await getUnreadCount(c.env.DB, user.id);

  return c.json({ success: true, data: { count } });
});

// ------------------------------------------------------------
//  DELETE /  — 删除通知（读后即删）
// ------------------------------------------------------------

notificationRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  const id = c.req.query("id");
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await deleteNotification(c.env.DB, id, user.id);
  if (!ok) {
    // 零信任：通知不存在或不属于该用户 → 404
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default notificationRoutes;
