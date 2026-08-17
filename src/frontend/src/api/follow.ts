/**
 * 关注 API（/api/follow）
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { FollowStatus } from "../types";

/** 关注用户（follow_user 权限） */
export function followUser(targetUserId: string): Promise<void> {
  return apiPost<void>("/api/follow", { targetUserId });
}

/** 取消关注 */
export function unfollowUser(targetUserId: string): Promise<void> {
  return apiDelete<void>("/api/follow", { params: { targetUserId } });
}

/** 查询与目标用户的关注状态（双向） */
export function getFollowStatus(targetUserId: string): Promise<FollowStatus> {
  return apiGet<FollowStatus>("/api/follow/status", {
    params: { targetUserId },
  });
}
