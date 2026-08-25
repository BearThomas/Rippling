/**
 * 管理日志 API 路由
 *
 * 路由表（挂载前缀 /api/admin-log）：
 *   GET /list  管理日志列表（完全公开，游客可看，无需任何权限）
 *
 * 所有字段完全公开（包括 detail），支持按 adminId / action / targetType 筛选。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { listAdminLogs } from "../db";

// ============================================================
//  类型定义
// ============================================================

/** 管理日志路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

// ============================================================
//  路由实例
// ============================================================

const adminLogRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /list  — 管理日志列表（公开接口）
//
//  查询参数：limit（默认 50，最大 100）、offset、adminId、action、targetType
// ------------------------------------------------------------

adminLogRoutes.get("/list", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const adminId = c.req.query("adminId") || undefined;
  const action = c.req.query("action") || undefined;
  const targetType = c.req.query("targetType") || undefined;

  // limit 上限与 offset 下限由 DAL 层统一夹取
  const logs = await listAdminLogs(c.env.DB, {
    adminId,
    action,
    targetType,
    limit,
    offset,
  });

  return c.json({ success: true, data: logs });
});

export default adminLogRoutes;
