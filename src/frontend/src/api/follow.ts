/**
 * 关注 API（/api/follow）
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { FollowStatus, FollowUserInfo } from "../types";

/** 关注用户（follow_user 权限；关注成功会通知被关注者） */
export function followUser(targetUserId: string): Promise<{ following: boolean }> {
  return apiPost<{ following: boolean }>("/api/follow", { targetUserId });
}

/** 取消关注（targetUserId 走 query 参数） */
export function unfollowUser(targetUserId: string): Promise<{ following: boolean }> {
  return apiDelete<{ following: boolean }>("/api/follow", {
    params: { targetUserId },
  });
}

/** 查询是否关注了目标用户（单向：我 → TA） */
export function getFollowStatus(targetUserId: string): Promise<FollowStatus> {
  return apiGet<FollowStatus>("/api/follow/status", {
    params: { targetUserId },
  });
}

/** 关注列表（TA 关注了谁，公开接口） */
export function listFollowing(
  userId: string,
  limit = 20,
  offset = 0
): Promise<FollowUserInfo[]> {
  return apiGet<FollowUserInfo[]>("/api/follow/following", {
    params: { userId, limit, offset },
  });
}

/** 粉丝列表（谁关注了 TA，公开接口） */
export function listFollowers(
  userId: string,
  limit = 20,
  offset = 0
): Promise<FollowUserInfo[]> {
  return apiGet<FollowUserInfo[]>("/api/follow/followers", {
    params: { userId, limit, offset },
  });
}
