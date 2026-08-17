/**
 * 用户 API
 *
 * 当前后端无独立的用户资料路由，会话信息来自 Better Auth
 * （/api/auth/get-session）；管理员查看用户走 /api/admin/user。
 * 本模块封装会话查询，并预留用户资料接口。
 */

import { apiGet } from "./client";
import { getSession as fetchSession } from "./auth";
import type { SessionInfo, UserProfile } from "../types";

/** 获取当前会话（游客返回 null） */
export function getCurrentSession(): Promise<SessionInfo | null> {
  return fetchSession();
}

/**
 * 获取用户公开资料（预留：后端后续提供公开资料接口后启用）
 * 当前通过管理员接口需要 access_admin_panel 权限。
 */
export function getUserProfileForAdmin(userId: string): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/admin/user", { params: { id: userId } });
}
