/**
 * 管理面板 API（/api/admin）
 *
 * 权限要求：
 *   - 聚合 / 用户查询 / 查看配置：access_admin_panel（位16）
 *   - 权限修改 / 封禁 / 解封 / 重置违规 / 修改配置：edit_others_permission（位15）
 *   - 数据库查看 / 归档查看：view_database（位17）
 *   - 执行 SQL：edit_database（位18）
 */

import { apiGet, apiPost, apiPut } from "./client";
import type { AdminUserInfo, SiteConfig, TicketInfo } from "../types";

// ------------------------------------------------------------
//  面板聚合
// ------------------------------------------------------------

/** 面板聚合信息 */
export interface AdminSummary {
  totalUsers: number;
  totalPosts: number;
  totalComments: number;
  totalConfessions: number;
  totalTimelineEvents: number;
  totalTickets: number;
  /** 待处理工单数 */
  openTickets: number;
  totalBlocks: number;
  recentTickets: TicketInfo[];
}

export function getAdminSummary(): Promise<AdminSummary> {
  return apiGet<AdminSummary>("/api/admin/summary");
}

// ------------------------------------------------------------
//  用户管理
// ------------------------------------------------------------

/** 用户列表（可按用户名 / 学号模糊搜索） */
export function listUsersForAdmin(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminUserInfo[]> {
  return apiGet<AdminUserInfo[]>("/api/admin/users", { params });
}

/** 用户详情 */
export function getAdminUser(id: string): Promise<AdminUserInfo> {
  return apiGet<AdminUserInfo>("/api/admin/user", { params: { id } });
}

/** 修改用户权限（permissions 传十进制字符串） */
export function setUserPermissions(userId: string, permissions: string): Promise<void> {
  return apiPut<void>("/api/admin/user/permissions", { userId, permissions });
}

/** 封禁用户 */
export function banUser(userId: string): Promise<void> {
  return apiPost<void>("/api/admin/user/ban", { userId });
}

/** 解封用户 */
export function unbanUser(userId: string): Promise<void> {
  return apiPost<void>("/api/admin/user/unban", { userId });
}

/** 重置违规次数 */
export function resetUserViolations(userId: string): Promise<void> {
  return apiPost<void>("/api/admin/user/reset-violations", { userId });
}

// ------------------------------------------------------------
//  站点配置
// ------------------------------------------------------------

/** 查看站点配置（管理面板视角） */
export function getAdminSiteConfig(): Promise<SiteConfig> {
  return apiGet<SiteConfig>("/api/admin/config");
}

/** 修改站点配置（edit_database 权限） */
export function updateAdminSiteConfig(config: SiteConfig): Promise<void> {
  return apiPut<void>("/api/admin/config", config);
}

// ------------------------------------------------------------
//  数据库查看与 SQL 执行
// ------------------------------------------------------------

/** 表信息 */
export interface DatabaseTableInfo {
  name: string;
  sql: string | null;
}

/** 表列表（view_database 权限） */
export function listDatabaseTables(): Promise<DatabaseTableInfo[]> {
  return apiGet<DatabaseTableInfo[]>("/api/admin/database/tables");
}

/** 表数据（前 100 行，view_database 权限） */
export function getTableData(name: string): Promise<Record<string, unknown>[]> {
  return apiGet<Record<string, unknown>[]>("/api/admin/database/table", {
    params: { name },
  });
}

/** SQL 查询结果（仅 SELECT / WITH） */
export interface SqlQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** 实际总行数（可能大于返回行数） */
  rowCount: number;
  /** 超过 500 行被截断时为 true */
  truncated: boolean;
}

/** 执行只读 SQL（edit_database 权限，仅允许 SELECT / WITH） */
export function executeSql(sql: string): Promise<SqlQueryResult> {
  return apiPost<SqlQueryResult>("/api/admin/database/query", { sql });
}

// ------------------------------------------------------------
//  归档查看器
// ------------------------------------------------------------

/** 归档文件信息 */
export interface ArchiveFileInfo {
  id: string;
  filePath: string;
  targetType: string | null;
  targetId: string | null;
  archivedAt: string;
}

/** 归档文件列表（view_database 权限，支持分页） */
export function listArchiveFiles(limit = 20, offset = 0): Promise<ArchiveFileInfo[]> {
  return apiGet<ArchiveFileInfo[]>("/api/admin/archive/files", {
    params: { limit, offset },
  });
}

/** 归档文件解密内容（与后端 ArchiveFileContent 结构一致） */
export interface ArchiveFileContent {
  /** 归档格式版本 */
  version: number;
  /** 归档执行时间（ISO 8601） */
  archivedAt: string;
  /** 最终状态快照（归档时刻的完整记录） */
  result: Record<string, unknown>;
  /** 完整操作链 */
  operations: Record<string, unknown>[];
}

/** 归档文件内容（解密后，view_database 权限；路径由客户端自动 URL 编码） */
export function getArchiveFileContent(path: string): Promise<ArchiveFileContent> {
  return apiGet<ArchiveFileContent>("/api/admin/archive/file", {
    params: { path },
  });
}
