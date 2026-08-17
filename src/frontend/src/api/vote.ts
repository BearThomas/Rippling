/**
 * 投票 API（/api/vote）
 */

import { apiGet, apiPost } from "./client";
import type { VoteInfo, VoteListItem } from "../types";

/** 创建投票参数 */
export interface CreateVoteInput {
  /** 标题（≤100 字） */
  title: string;
  /** 描述（≤500 字，可选） */
  description?: string;
  /** 选项内容列表（至少 2 项） */
  options: string[];
  /** 是否多选 */
  isMultiple?: boolean;
  /** 是否实时可见结果 */
  isRealTimeVisible?: boolean;
  /** 截止时间（ISO 8601） */
  endAt: string;
}

/** 投票列表（description 为预览，totalVotes 不可见时为 null） */
export function getVoteList(limit = 20, offset = 0): Promise<VoteListItem[]> {
  return apiGet<VoteListItem[]>("/api/vote/list", { params: { limit, offset } });
}

/** 投票详情（含选项 / 票数可见性 / 我的投票） */
export function getVoteDetail(id: string): Promise<VoteInfo> {
  return apiGet<VoteInfo>("/api/vote", { params: { id } });
}

/** 创建投票（create_vote 权限），返回新投票 ID */
export function createVote(input: CreateVoteInput): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/vote", input);
}

/** 投票（后端只返回 success，无 data；结果需重新拉详情） */
export function castVote(voteId: string, optionIds: string[]): Promise<void> {
  return apiPost<void>("/api/vote/cast", { voteId, optionIds });
}

/** 关闭投票（创建者本人或管理员；body 为 { id }） */
export function closeVote(id: string): Promise<void> {
  return apiPost<void>("/api/vote/close", { id });
}
