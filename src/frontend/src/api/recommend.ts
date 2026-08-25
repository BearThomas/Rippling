/**
 * 推荐流 API（/api/recommend）
 *
 * 游标分页：第一页不传游标（返回置顶）；
 * 后续页传上一页 nextCursor 的 lastScore / lastId。
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { RecommendFeed } from "../types";

/** 获取推荐流（游标分页，第一页含置顶内容） */
export function getRecommendFeed(
  lastScore?: number,
  lastId?: string
): Promise<RecommendFeed> {
  return apiGet<RecommendFeed>("/api/recommend", {
    params: { lastScore, lastId },
  });
}

/** 置顶内容（pin_post 权限；表白墙不可置顶） */
export function pinRecommend(
  targetType: "post" | "timeline" | "vote",
  targetId: string,
  expiresAt?: string
): Promise<void> {
  return apiPost<void>("/api/recommend/pin", { targetType, targetId, expiresAt });
}

/** 取消置顶（pin_post 权限） */
export function unpinRecommend(targetType: string, targetId: string): Promise<void> {
  return apiDelete<void>("/api/recommend/pin", {
    params: { targetType, targetId },
  });
}
