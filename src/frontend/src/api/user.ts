/**
 * 用户 API（/api/user）
 *
 * 公开资料 / 用户内容列表（游客可见）；
 * 用户名 / 头像 / 密码修改（登录 + 对应权限）。
 * 会话查询仍来自 Better Auth（api/auth.ts），管理员查用户走 api/admin.ts。
 */

import { apiGet, apiPost, apiPut } from "./client";
import { getSession as fetchSession } from "./auth";
import type {
  SessionInfo,
  UserProfile,
  UserPublicProfile,
  UserPostsData,
  UserCommentsData,
} from "../types";

/** 获取当前会话（游客返回 null） */
export function getCurrentSession(): Promise<SessionInfo | null> {
  return fetchSession();
}

/**
 * 获取用户公开资料（游客可见；用户不存在 → 404）
 * 含头像、关注 / 粉丝数、当前用户是否已关注 TA。
 */
export function getUserProfile(userId: string): Promise<UserPublicProfile> {
  return apiGet<UserPublicProfile>("/api/user/profile", {
    params: { userId },
  });
}

/** 用户的帖子列表（公开 + 权限过滤 + enrichment，分页） */
export function getUserPosts(
  userId: string,
  limit = 20,
  offset = 0
): Promise<UserPostsData> {
  return apiGet<UserPostsData>("/api/user/posts", {
    params: { userId, limit, offset },
  });
}

/** 用户的评论列表（公开 + 权限过滤 + enrichment，分页） */
export function getUserComments(
  userId: string,
  limit = 20,
  offset = 0
): Promise<UserCommentsData> {
  return apiGet<UserCommentsData>("/api/user/comments", {
    params: { userId, limit, offset },
  });
}

/**
 * 修改用户名（modify_own_username 权限，每月最多 4 次）
 * 仅允许中文 / 字母 / 数字 / 下划线，1-50 字。
 */
export function updateUsername(username: string): Promise<{ username: string }> {
  return apiPut<{ username: string }>("/api/user/username", { username });
}

/** 修改头像（avatarUrl 需先经 /api/upload/image 上传得到） */
export function updateAvatar(avatarUrl: string): Promise<{ avatarUrl: string }> {
  return apiPut<{ avatarUrl: string }>("/api/user/avatar", { avatarUrl });
}

/** 修改名字牌子（set_name_badge，0-7 字，无换行与控制字符） */
export function updateBadge(badge: string): Promise<{ badge: string }> {
  return apiPut<{ badge: string }>("/api/user/badge", { badge });
}

/** 修改密码（modify_password 权限；新密码至少 8 位） */
export function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  return apiPost<void>("/api/user/password", { currentPassword, newPassword });
}

/** 管理员查看用户详情（access_admin_panel 权限） */
export function getUserProfileForAdmin(userId: string): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/admin/user", { params: { id: userId } });
}
