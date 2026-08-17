/**
 * 表白墙 API（/api/confession）
 */

import { apiGet, apiPost, apiDelete } from "./client";
import type { ConfessionInfo } from "../types";

/** 表白墙详情 */
export function getConfession(id: string): Promise<ConfessionInfo> {
  return apiGet<ConfessionInfo>("/api/confession", { params: { id } });
}

/** 表白墙列表（公开） */
export function listConfessions(limit = 20, offset = 0): Promise<ConfessionInfo[]> {
  return apiGet<ConfessionInfo[]>("/api/confession/list", { params: { limit, offset } });
}

/** 发布表白墙（create_confession 权限） */
export function createConfession(content: string): Promise<ConfessionInfo> {
  return apiPost<ConfessionInfo>("/api/confession", { content });
}

/** 删除自己的表白墙 */
export function deleteConfession(confessionId: string): Promise<void> {
  return apiDelete<void>("/api/confession", { body: { confessionId } });
}
