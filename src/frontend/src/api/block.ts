/**
 * 板块 API（/api/block）
 *
 * 与后端 src/routes/block.ts 契约一一对应：
 *   - approve / reject 以 (blockId, userId) 定位申请（后端 reject 不支持 reason）
 *   - lock / unlock 为两个独立端点
 *   - DELETE / 使用 query 参数 blockId
 */

import { apiDelete, apiGet, apiPost } from "./client";
import type { BlockDetailInfo, BlockInfo } from "../types";

/** 板块成员信息（后端 permissions 为十进制字符串） */
export interface BlockMemberInfo {
  userId: string;
  username: string;
  role: string;
  permissions: string;
  joinedAt: string;
}

/** 加入申请信息（含后端附加的申请用户名） */
export interface BlockJoinRequestInfo {
  id: string;
  userId: string;
  username: string | null;
  status: string;
  createdAt: string;
}

/** 黑名单条目（含后端附加的用户名） */
export interface BlockBlacklistEntry {
  id: string;
  userId: string;
  username: string | null;
  reason: string | null;
  createdAt: string;
}

/** 板块帖子流响应 */
export interface BlockPostsData {
  posts: unknown[];
  total: number;
}

// ------------------------------------------------------------
//  查询类
// ------------------------------------------------------------

/** 获取全部未删除板块列表（公开） */
export function getBlockList(): Promise<BlockInfo[]> {
  return apiGet<BlockInfo[]>("/api/block/list");
}

/** 获取板块详情（含 isMember / myRole / myPermissions） */
export function getBlockDetail(id: string): Promise<BlockDetailInfo> {
  return apiGet<BlockDetailInfo>("/api/block", { params: { id } });
}

/** 获取我加入的板块列表 */
export function getMyBlocks(): Promise<BlockInfo[]> {
  return apiGet<BlockInfo[]>("/api/block/my");
}

/** 获取我的待审加入申请所属板块 ID 列表 */
export function getMyPendingRequests(): Promise<string[]> {
  return apiGet<string[]>("/api/block/my-requests", { silentError: true });
}

/** 获取板块帖子流（offset 分页） */
export function getBlockPosts<T = unknown>(
  blockId: string,
  limit = 20,
  offset = 0
): Promise<{ posts: T[]; total: number }> {
  return apiGet<{ posts: T[]; total: number }>("/api/block/posts", {
    params: { blockId, limit, offset },
    silentError: true,
  });
}

/** 获取板块成员列表（板主） */
export function getBlockMembers(blockId: string): Promise<BlockMemberInfo[]> {
  return apiGet<BlockMemberInfo[]>("/api/block/members", { params: { blockId } });
}

/** 获取待审核的加入申请（板主） */
export function getJoinRequests(blockId: string): Promise<BlockJoinRequestInfo[]> {
  return apiGet<BlockJoinRequestInfo[]>("/api/block/requests", { params: { blockId } });
}

/** 获取黑名单列表（板主） */
export function getBlockBlacklist(blockId: string): Promise<BlockBlacklistEntry[]> {
  return apiGet<BlockBlacklistEntry[]>("/api/block/blacklist", { params: { blockId } });
}

// ------------------------------------------------------------
//  成员操作类
// ------------------------------------------------------------

/** 创建板块（manage_block 权限；普通用户走建板工单） */
export function createBlock(name: string, description?: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/block", { name, description });
}

/** 申请加入板块 */
export function joinBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/join", { blockId });
}

/** 批准加入申请（板主，按 blockId + userId 定位） */
export function approveJoin(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/approve", { blockId, userId });
}

/** 拒绝加入申请（板主；后端不支持拒绝原因） */
export function rejectJoin(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/reject", { blockId, userId });
}

/** 移除成员（板主） */
export function removeMember(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/member/remove", { blockId, userId });
}

/** 修改成员权限（板主；permissions 为十进制字符串） */
export function updateMemberPermissions(
  blockId: string,
  userId: string,
  permissions: string
): Promise<void> {
  return apiPost<void>("/api/block/member/permissions", { blockId, userId, permissions });
}

/** 加入黑名单（板主） */
export function addToBlacklist(blockId: string, userId: string, reason?: string): Promise<void> {
  return apiPost<void>("/api/block/blacklist/add", { blockId, userId, reason });
}

/** 移出黑名单（板主） */
export function removeFromBlacklist(blockId: string, userId: string): Promise<void> {
  return apiPost<void>("/api/block/blacklist/remove", { blockId, userId });
}

/** 转让板块（仅 owner） */
export function transferOwnership(blockId: string, newOwnerId: string): Promise<void> {
  return apiPost<void>("/api/block/transfer", { blockId, newOwnerId });
}

/** 退出板块（owner 不可退出） */
export function leaveBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/leave", { blockId });
}

/** 锁定板块（manage_block 权限） */
export function lockBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/lock", { blockId });
}

/** 解锁板块（manage_block 权限） */
export function unlockBlock(blockId: string): Promise<void> {
  return apiPost<void>("/api/block/unlock", { blockId });
}

/** 删除板块（block_delete 板块权限或 manage_block） */
export function deleteBlock(blockId: string): Promise<void> {
  return apiDelete<void>("/api/block", { params: { blockId } });
}
