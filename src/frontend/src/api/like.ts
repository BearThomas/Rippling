/**
 * 点赞 API（/api/like）
 *
 * 多态点赞：targetType 区分 post / comment / confession / timeline / vote。
 * 点赞为切换语义（已赞则取消），返回最新状态与总数。
 */

import { apiGet, apiPost } from "./client";

/** 可点赞的目标类型 */
export type LikeTargetType = "post" | "comment" | "confession" | "timeline" | "vote";

/** 切换点赞结果 */
export interface ToggleLikeResult {
  /** 操作后的点赞状态 */
  liked: boolean;
  /** 操作后的点赞总数 */
  likeCount: number;
}

/** 切换点赞（赞 ↔ 取消，需 like 权限） */
export function toggleLike(
  targetType: LikeTargetType,
  targetId: string
): Promise<ToggleLikeResult> {
  return apiPost<ToggleLikeResult>("/api/like", { targetType, targetId });
}

/** 获取目标点赞总数（公开接口） */
export function getLikeCount(
  targetType: LikeTargetType,
  targetId: string
): Promise<number> {
  return apiGet<{ count: number }>("/api/like/count", {
    params: { targetType, targetId },
  }).then((data) => data.count);
}
