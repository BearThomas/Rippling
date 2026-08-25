/**
 * 表白墙 API（/api/confession）
 *
 * 表白墙永远匿名：后端不返回作者信息，前端不展示作者。
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { ConfessionInfo, ConfessionListItem } from "../types";

/** 表白墙列表（公开，preview 为 100 字截断预览） */
export function getConfessionList(limit = 20, offset = 0): Promise<ConfessionListItem[]> {
  return apiGet<ConfessionListItem[]>("/api/confession/list", { params: { limit, offset } });
}

/** 表白墙详情（完整内容，无作者信息） */
export function getConfessionDetail(id: string): Promise<ConfessionInfo> {
  return apiGet<ConfessionInfo>("/api/confession", { params: { id } });
}

/** 发布表白（create_confession 权限，≤1000 字），返回新记录 ID */
export function createConfession(content: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/confession", { content });
}

/** 删除自己的表白（后端按 query id 删除） */
export function deleteConfession(id: string): Promise<void> {
  return apiDelete<void>("/api/confession", { params: { id } });
}
