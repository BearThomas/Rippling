/**
 * 板块 API（/api/block）
 */

import { apiGet, apiPost } from "./client";
import type { BlockInfo } from "../types";

/** 板块成员信息 */
export interface BlockMemberInfo {
  id: string;
  userId: string;
  username: string;
  role: string;
  permissions: string;
  joinedAt: string;
}

/** 加入申请信息 */
export interface BlockJoinRequestInfo {
  id: string;
  blockId: string;
  userId: string;
  username?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

/** 获取板块列表 */
export function listBlocks(): Promise<BlockInfo[]> {
  return apiGet<BlockInfo[]>("/api/block/list");
}

/** 获取板块详情 */
export function getBlock(id: string): Promise<BlockInfo> {
  return apiGet<BlockInfo>("/api/block", { params: { id } });
}

/** 创建板块（manage_block 权限；普通用户走建板工单） */
export function createBlock(name: string, description?: string): Promise<BlockInfo> {
  return apiPost<BlockInfo>("/api/block", { name, description });
}

/** 申请加入板块 */
export function joinBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/join", { blockId });
}

/** 查看板块加入申请（板主） */
export function listJoinRequests(blockId: string): Promise<BlockJoinRequestInfo[]> {
  return apiGet<BlockJoinRequestInfo[]>("/api/block/requests", { params: { blockId } });
}

/** 批准加入申请（板主） */
export function approveJoin(requestId: string): Promise<void> {
  return apiPost<void>("/api/block/approve", { requestId });
}

/** 拒绝加入申请（板主） */
export function rejectJoin(requestId: string, reason?: string): Promise<void> {
  return apiPost<void>("/api/block/reject", { requestId, reason });
}

/** 获取板块成员列表 */
export function listMembers(blockId: string): Promise<BlockMemberInfo[]> {
  return apiGet<BlockMemberInfo[]>("/api/block/members", { params: { blockId } });
}

/** 移除成员（板主） */
export function removeMember(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/member/remove", { blockId, userId });
}

/** 修改成员权限（板主） */
export function setMemberPermissions(
  blockId: string,
  userId: string,
  permissions: string
): Promise<void> {
  return apiPost<void>("/api/block/member/permissions", { blockId, userId, permissions });
}

/** 加入黑名单 */
export function addBlacklist(blockId: string, userId: string, reason?: string): Promise<void> {
  return apiPost<void>("/api/block/blacklist/add", { blockId, userId, reason });
}

/** 移出黑名单 */
export function removeBlacklist(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/blacklist/remove", { blockId, userId });
}

/** 转让板块（板主） */
export function transferBlock(blockId: string, newOwnerId: string): Promise<void> {
  return apiPost<void>("/api/block/transfer", { blockId, newOwnerId });
}

/** 退出板块 */
export function leaveBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/leave", { blockId });
}

/** 锁定 / 解锁板块（manage_block 权限） */
export function lockBlock(blockId: string, lock: boolean): Promise<void> {
  return apiPost<void>("/api/block/lock", { blockId, lock });
}
