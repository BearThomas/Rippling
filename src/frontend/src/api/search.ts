/**
 * 搜索 API（/api/search）
 */

import { apiGet } from "./client";
import type { PostInfo, ConfessionInfo } from "../types";

/** 搜索结果 */
export interface SearchResult {
  posts: PostInfo[];
  confessions: ConfessionInfo[];
}

/** 全站搜索（关键词） */
export function search(
  keyword: string,
  limit = 20,
  offset = 0
): Promise<SearchResult> {
  return apiGet<SearchResult>("/api/search", {
    params: { keyword, limit, offset },
  });
}
