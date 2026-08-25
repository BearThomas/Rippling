/**
 * 搜索 API（/api/search）
 *
 * 搜索范围：帖子 / 评论 / 用户 / 板块 / 大事记 / 表白墙。
 * 安全规则：学号永不返回；表白墙作者永不返回。
 */

import { apiGet } from "./client";
import type { SearchData, SearchType } from "../types";

/**
 * 全站搜索
 *
 * @param q      关键词（不能为空）
 * @param type   类型过滤：all | post | user | block | timeline | confession | comment
 * @param limit  每页条数（上限 100）
 * @param offset 偏移量（加载更多时递增）
 */
export function search(
  q: string,
  type: SearchType = "all",
  limit = 20,
  offset = 0
): Promise<SearchData> {
  return apiGet<SearchData>("/api/search", {
    params: { q, type, limit, offset },
  });
}
