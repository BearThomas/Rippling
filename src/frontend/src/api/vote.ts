/**
 * 投票 API（/api/vote）
 */

import { apiGet, apiPost } from "./client";
import type { VoteInfo } from "../types";

/** 创建投票参数 */
export interface CreateVoteInput {
  title: string;
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

/** 投票列表 */
export function listVotes(limit = 20, offset = 0): Promise<VoteInfo[]> {
  return apiGet<VoteInfo[]>("/api/vote/list", { params: { limit, offset } });
}

/** 投票详情（含选项与票数） */
export function getVote(id: string): Promise<VoteInfo> {
  return apiGet<VoteInfo>("/api/vote", { params: { id } });
}

/** 创建投票（create_vote 权限） */
export function createVote(input: CreateVoteInput): Promise<VoteInfo> {
  return apiPost<VoteInfo>("/api/vote", input);
}

/** 投票（可多选取决于投票设置） */
export function castVote(voteId: string, optionIds: string[]): Promise<VoteInfo> {
  return apiPost<VoteInfo>("/api/vote/cast", { voteId, optionIds });
}

/** 关闭投票（发起人） */
export function closeVote(voteId: string): Promise<void> {
  return apiPost<void>("/api/vote/close", { voteId });
}
