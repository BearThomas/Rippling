/**
 * 推荐流 API（/api/recommend）
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { PostInfo } from "../types";

/** 推荐流响应 */
export interface RecommendFeed {
  /** 置顶项 */
  pinned: PostInfo[];
  /** 推荐帖子 */
  posts: PostInfo[];
}

/** 获取推荐流（含置顶项） */
export function getRecommendFeed(): Promise<RecommendFeed> {
  return apiGet<RecommendFeed>("/api/recommend");
}

/** 推荐流置顶某帖子（pin_post 权限） */
export function pinRecommend(postId: string, expiresAt?: string): Promise<void> {
  return apiPost<void>("/api/recommend/pin", { postId, expiresAt });
}

/** 取消推荐流置顶（pin_post 权限） */
export function unpinRecommend(postId: string): Promise<void> {
  return apiDelete<void>("/api/recommend/pin", { body: { postId } });
}
