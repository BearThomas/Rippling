/**
 * 管理日志 API（/api/admin-log，完全公开）
 */

import { apiGet } from "./client";
import type { AdminLogInfo } from "../types";

/** 管理日志筛选参数（type 别名以兼容 Record 索引签名） */
export type AdminLogListParams = {
  adminId?: string;
  action?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
}

/** 查询管理日志（公开接口，游客可看） */
export function listAdminLogs(params: AdminLogListParams = {}): Promise<AdminLogInfo[]> {
  return apiGet<AdminLogInfo[]>("/api/admin-log/list", { params });
}
