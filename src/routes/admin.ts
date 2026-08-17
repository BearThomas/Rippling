/**
 * 管理员用户管理 API 路由
 *
 * 路由表（挂载前缀 /api/admin）：
 *   用户管理：
 *   GET  /users                  用户列表（access_admin_panel，可模糊搜索）
 *   GET  /user                   用户详情（access_admin_panel）
 *   PUT  /user/permissions       修改用户权限（edit_others_permission）
 *   POST /user/ban               封禁用户（edit_others_permission）
 *   POST /user/unban             解封用户（edit_others_permission）
 *   POST /user/reset-violations  重置违规次数（edit_others_permission）
 *
 *   面板聚合：
 *   GET  /summary                面板聚合信息（access_admin_panel）
 *
 *   站点配置：
 *   GET  /config                 查看站点配置（access_admin_panel）
 *   PUT  /config                 修改站点配置（edit_database）
 *
 *   数据库：
 *   GET  /database/tables        表列表（view_database）
 *   GET  /database/table         单表前 100 行（view_database）
 *   POST /database/query         执行只读 SQL（edit_database）
 *
 *   归档查看器：
 *   GET  /archive/files          归档文件列表（view_database）
 *   GET  /archive/file           归档文件内容（view_database，解密）
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
import type { SiteConfig } from "../db/siteConfig";
import type { ArchiveEnv } from "../utils/archive";
import {
  getAdminUserInfo,
  listUsersForAdmin,
  setUserPermissions,
  banUser,
  unbanUser,
  resetUserViolations,
  getSiteConfig,
  updateSiteConfig,
  listArchiveFiles,
  getArchiveFileContent,
  getRecentTickets,
  writeAdminLog,
} from "../db";
import {
  PERM_ACCESS_ADMIN_PANEL,
  PERM_EDIT_OTHERS_PERMISSION,
  PERM_VIEW_DATABASE,
  PERM_EDIT_DATABASE,
} from "../shared/permissions";
import {
  UNAUTHORIZED,
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";
import staticSiteConfig from "../../config/site.config.json";

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

// ============================================================
//  面板聚合信息
// ============================================================

/** 执行 COUNT 查询的辅助函数 */
async function countOf(db: D1Database, sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ count: number }>();
  return row?.count ?? 0;
}

// ------------------------------------------------------------
//  GET /summary  — 面板聚合信息（access_admin_panel）
// ------------------------------------------------------------

adminRoutes.get("/summary", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_ACCESS_ADMIN_PANEL)) {
    return errorResponse(c, NOT_FOUND);
  }

  // 各项统计（全部 COUNT 查询，无用户输入无需绑定参数）
  const [
    totalUsers,
    totalPosts,
    totalComments,
    totalConfessions,
    totalTimelineEvents,
    totalTickets,
    openTickets,
    totalBlocks,
  ] = await Promise.all([
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM user_profile"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM post WHERE parentId IS NULL AND isDeleted = 0"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM post WHERE parentId IS NOT NULL AND isDeleted = 0"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM confession WHERE isDeleted = 0"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM timeline_event"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM ticket"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM ticket WHERE status = 'open'"),
    countOf(c.env.DB, "SELECT COUNT(*) as count FROM block WHERE isDeleted = 0"),
  ]);

  // 最近 5 条工单
  const recentTickets = await getRecentTickets(c.env.DB, 5);

  return c.json({
    success: true,
    data: {
      totalUsers,
      totalPosts,
      totalComments,
      totalConfessions,
      totalTimelineEvents,
      totalTickets,
      openTickets,
      totalBlocks,
      recentTickets,
    },
  });
});

// ============================================================
//  站点配置
// ============================================================

// ------------------------------------------------------------
//  GET /config  — 查看站点配置（access_admin_panel）
//
//  优先读 D1，无配置时回退静态 site.config.json。
// ------------------------------------------------------------

adminRoutes.get("/config", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_ACCESS_ADMIN_PANEL)) {
    return errorResponse(c, NOT_FOUND);
  }

  const config = await getSiteConfig(c.env.DB);

  return c.json({ success: true, data: config ?? staticSiteConfig });
});

// ------------------------------------------------------------
//  PUT /config  — 修改站点配置（edit_database）
// ------------------------------------------------------------

adminRoutes.put("/config", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  // 结构校验在 DAL 层完成，非法结构返回 false → 400
  const ok = await updateSiteConfig(c.env.DB, body as SiteConfig, user as CurrentUser);
  if (!ok) {
    return errorResponse(c, VALIDATION_ERROR, "配置结构不完整或非法");
  }

  return c.json({ success: true });
});

// ============================================================
//  数据库查看与 SQL 执行
// ============================================================

// ------------------------------------------------------------
//  GET /database/tables  — 表列表（view_database）
// ------------------------------------------------------------

adminRoutes.get("/database/tables", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_VIEW_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  // 排除 sqlite 系统表（sqlite_sequence 等）
  const rows = await c.env.DB
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all<{ name: string; sql: string | null }>();

  return c.json({ success: true, data: rows.results });
});

// ------------------------------------------------------------
//  GET /database/table  — 单表前 100 行（view_database）
//
//  表名白名单：先查 sqlite_master 验证表真实存在，
//  再拒绝非标识符字符，最后双引号包裹防注入。
// ------------------------------------------------------------

adminRoutes.get("/database/table", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_VIEW_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  const name = c.req.query("name") ?? "";
  if (!name) return errorResponse(c, VALIDATION_ERROR, "缺少 name 参数");

  // 表名必须为合法标识符（字母 / 数字 / 下划线）
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return errorResponse(c, VALIDATION_ERROR, "表名格式非法");
  }

  // 白名单验证：表必须真实存在（参数化查询）
  const exists = await c.env.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();

  if (!exists) return errorResponse(c, NOT_FOUND);

  // 表名已经过白名单验证，双引号包裹后拼接安全
  const rows = await c.env.DB
    .prepare(`SELECT * FROM "${name}" LIMIT 100`)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: rows.results });
});

// ------------------------------------------------------------
//  POST /database/query  — 执行只读 SQL（edit_database，最高风险）
//
//  安全限制：
//    1. 仅允许 SELECT / WITH 开头的只读查询
//    2. 禁止分号（多语句）
//    3. 最多返回 500 行（超出截断并标记 truncated）
//    4. prepare 编译失败时返回错误信息
//    5. 每次执行写 admin_log（action = 'execute_sql'）
// ------------------------------------------------------------

/** 查询结果最大返回行数 */
const QUERY_MAX_ROWS = 500;

adminRoutes.post("/database/query", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_EDIT_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  // 去除首尾空白与末尾分号
  const sql = ((body.sql as string) ?? "").trim().replace(/;+\s*$/, "");

  if (!sql) return errorResponse(c, VALIDATION_ERROR, "缺少 sql");

  // 只允许 SELECT / WITH 开头的只读查询
  if (!/^(SELECT|WITH)\b/i.test(sql)) {
    return errorResponse(c, VALIDATION_ERROR, "仅允许 SELECT / WITH 只读查询");
  }

  // 禁止分号（防止多语句）
  if (sql.includes(";")) {
    return errorResponse(c, VALIDATION_ERROR, "禁止多语句（不允许包含分号）");
  }

  // 先编译再执行：编译失败返回错误信息
  let stmt;
  try {
    stmt = c.env.DB.prepare(sql);
  } catch (err) {
    return errorResponse(
      c,
      VALIDATION_ERROR,
      `SQL 编译失败：${err instanceof Error ? err.message : String(err)}`
    );
  }

  let rows: Record<string, unknown>[];
  try {
    const result = await stmt.all<Record<string, unknown>>();
    rows = result.results;
  } catch (err) {
    return errorResponse(
      c,
      VALIDATION_ERROR,
      `SQL 执行失败：${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 写管理日志（含 SQL 内容，便于审计）
  await writeAdminLog(c.env.DB, {
    adminId: user.id,
    action: "execute_sql",
    targetType: "database",
    targetId: "query",
    detail: JSON.stringify({ sql, rowCount: rows.length }),
  });

  // 限制最大返回行数
  const truncated = rows.length > QUERY_MAX_ROWS;
  const limitedRows = rows.slice(0, QUERY_MAX_ROWS);

  // 列名从首行字段推断（无结果时为空数组）
  const columns = limitedRows.length ? Object.keys(limitedRows[0]) : [];

  return c.json({
    success: true,
    data: { columns, rows: limitedRows, rowCount: rows.length, truncated },
  });
});

// ============================================================
//  归档查看器
// ============================================================

// ------------------------------------------------------------
//  GET /archive/files  — 归档文件列表（view_database）
// ------------------------------------------------------------

adminRoutes.get("/archive/files", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_VIEW_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // limit 上限与 offset 下限由 DAL 层统一夹取
  const files = await listArchiveFiles(c.env.DB, limit, offset);

  return c.json({ success: true, data: files });
});

// ------------------------------------------------------------
//  GET /archive/file  — 归档文件内容（view_database，解密）
//
//  路径白名单：仅允许读取 archive_index 中登记过的路径，
//  从根本上防止路径穿越（../ 等）。
// ------------------------------------------------------------

adminRoutes.get("/archive/file", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_VIEW_DATABASE)) {
    return errorResponse(c, NOT_FOUND);
  }

  const filePath = c.req.query("path") ?? "";
  if (!filePath) return errorResponse(c, VALIDATION_ERROR, "缺少 path 参数");

  const archiveEnv: ArchiveEnv = {
    ENCRYPTION_KEY: c.env.ENCRYPTION_KEY ?? "",
    SITE_URL: new URL(c.req.url).origin,
  };

  const content = await getArchiveFileContent(c.env.DB, filePath, archiveEnv);
  if (!content) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true, data: content });
});

export default adminRoutes;
