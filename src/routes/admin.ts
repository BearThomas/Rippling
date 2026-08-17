/**
 * 管理员用户管理 API 路由
 *
 * 路由表（挂载前缀 /api/admin）：
 *   GET  /users                  用户列表（access_admin_panel，可模糊搜索）
 *   GET  /user                   用户详情（access_admin_panel）
 *   PUT  /user/permissions       修改用户权限（edit_others_permission）
 *   POST /user/ban               封禁用户（edit_others_permission）
 *   POST /user/unban             解封用户（edit_others_permission）
 *   POST /user/reset-violations  重置违规次数（edit_others_permission）
 *
 * 约束：
 *   - 无权限一律 404（不暴露管理接口存在性）
 *   - 学号等敏感信息仅管理员可见（本组路由全部要求 access_admin_panel）
 *   - 所有写操作的 admin_log 由 DAL 层统一写入（writeAdminLog）
 *   - permissions 以 BigInt 字符串形式返回 / 接收（JSON 不支持 bigint）
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { AdminUserInfo } from "../db/user";
import {
  getAdminUserInfo,
  listUsersForAdmin,
  setUserPermissions,
  banUser,
  unbanUser,
  resetUserViolations,
} from "../db";
import {
  PERM_ACCESS_ADMIN_PANEL,
  PERM_EDIT_OTHERS_PERMISSION,
} from "../shared/permissions";
import {
  UNAUTHORIZED,
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 管理路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

// ============================================================
//  辅助函数
// ============================================================

/** 统一错误响应 */
function errorResponse(
  c: any,
  err: { statusCode: number; code: string; message: string },
  message?: string
) {
  return c.json(
    { success: false, error: { code: err.code, message: message ?? err.message } },
    err.statusCode as any
  );
}

/**
 * AdminUserInfo → 可 JSON 序列化视图
 *
 * bigint 无法被 JSON.stringify 序列化，permissions 转为十进制字符串。
 */
function toResponse(u: AdminUserInfo) {
  return {
    id: u.id,
    username: u.username,
    studentId: u.studentId,
    permissions: String(u.permissions),
    nameColor: u.nameColor,
    badge: u.badge,
    violationCount: u.violationCount,
    isDeactivated: u.isDeactivated,
    createdAt: u.createdAt,
  };
}

// ============================================================
//  路由实例
// ============================================================

const adminRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /users  — 用户列表（access_admin_panel）
// ------------------------------------------------------------

adminRoutes.get("/users", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_ACCESS_ADMIN_PANEL)) {
    return errorResponse(c, NOT_FOUND);
  }

  const search = c.req.query("search") || undefined;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const users = await listUsersForAdmin(c.env.DB, search, limit, offset);

  return c.json({ success: true, data: users.map(toResponse) });
});

// ------------------------------------------------------------
//  GET /user  — 用户详情（access_admin_panel）
// ------------------------------------------------------------

adminRoutes.get("/user", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_ACCESS_ADMIN_PANEL)) {
    return errorResponse(c, NOT_FOUND);
  }

  const id = c.req.query("id");
  if (!id) return errorResponse(c, VALIDATION_ERROR, "缺少 id 参数");

  const info = await getAdminUserInfo(c.env.DB, id);
  if (!info) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true, data: toResponse(info) });
});

// ------------------------------------------------------------
//  PUT /user/permissions  — 修改用户权限（edit_others_permission）
// ------------------------------------------------------------

adminRoutes.put("/user/permissions", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_OTHERS_PERMISSION)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const userId = (body.userId as string) ?? "";
  const permissionsRaw = body.permissions;

  if (!userId) return errorResponse(c, VALIDATION_ERROR, "缺少 userId");
  if (permissionsRaw === undefined || permissionsRaw === null) {
    return errorResponse(c, VALIDATION_ERROR, "缺少 permissions");
  }

  // permissions 支持数字或 BigInt 字符串
  let permissions: bigint;
  try {
    permissions =
      typeof permissionsRaw === "string"
        ? BigInt(permissionsRaw)
        : BigInt(permissionsRaw as number);
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "permissions 格式错误");
  }
  if (permissions < 0n) {
    return errorResponse(c, VALIDATION_ERROR, "permissions 不能为负数");
  }

  const ok = await setUserPermissions(c.env.DB, userId, permissions, user as CurrentUser);
  if (!ok) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /user/ban  — 封禁用户（edit_others_permission）
// ------------------------------------------------------------

adminRoutes.post("/user/ban", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_OTHERS_PERMISSION)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const userId = (body.userId as string) ?? "";
  if (!userId) return errorResponse(c, VALIDATION_ERROR, "缺少 userId");

  const ok = await banUser(c.env.DB, userId, user as CurrentUser);
  if (!ok) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /user/unban  — 解封用户（edit_others_permission）
// ------------------------------------------------------------

adminRoutes.post("/user/unban", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_OTHERS_PERMISSION)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const userId = (body.userId as string) ?? "";
  if (!userId) return errorResponse(c, VALIDATION_ERROR, "缺少 userId");

  const ok = await unbanUser(c.env.DB, userId, user as CurrentUser);
  if (!ok) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /user/reset-violations  — 重置违规次数（edit_others_permission）
// ------------------------------------------------------------

adminRoutes.post("/user/reset-violations", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_OTHERS_PERMISSION)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const userId = (body.userId as string) ?? "";
  if (!userId) return errorResponse(c, VALIDATION_ERROR, "缺少 userId");

  const ok = await resetUserViolations(c.env.DB, userId, user as CurrentUser);
  if (!ok) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true });
});

export default adminRoutes;
