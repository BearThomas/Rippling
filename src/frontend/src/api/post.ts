/**
 * 帖子 / 评论 API（/api/post）
 *
 * 评论与帖子同表（parentId 区分）：
 *   - 创建评论走 POST /api/post/comment
 *   - 评论列表走 GET /api/post/comments?parentId=xxx
 *
 * 详情 / 评论列表返回已由后端附加 author / likeCount / commentCount / liked。
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { PostInfo } from "../types";

// ============================================================
//  参数类型
// ============================================================

/** 发帖参数 */
export interface CreatePostInput {
  content: string;
  title?: string;
  /** 可见性：public 公开 / private 仅自己 / selected 指定用户 */
  visibility?: "public" | "private" | "selected";
  /** 发往板块时指定板块 ID */
  blockId?: string;
  /** visibility = selected 时的可见用户 ID 列表 */
  visibleUserIds?: string[];
}

// ============================================================
//  帖子
// ============================================================

/** 获取单个帖子详情（含 author / likeCount / commentCount / liked） */
export function getPost(id: string): Promise<PostInfo> {
  return apiGet<PostInfo>("/api/post", { params: { id } });
}

/** 创建帖子，返回新帖 ID */
export function createPost(input: CreatePostInput): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/post", input);
}

/** 编辑帖子内容（仅作者本人，PUT 只接受 id + content） */
export function updatePost(id: string, content: string): Promise<void> {
  return apiPut<void>("/api/post", { id, content });
}

/** 软删除帖子（作者本人或管理员） */
export function deletePost(id: string): Promise<void> {
  return apiDelete<void>("/api/post", { params: { id } });
}

/** 置顶 / 取消置顶（切换语义；权限由后端按帖子归属判断） */
export function togglePinPost(id: string): Promise<void> {
  return apiPost<void>("/api/post/pin", { id });
}

// ============================================================
//  评论
// ============================================================

/** 获取某帖子 / 评论下的子评论列表（已附加 author / likeCount / liked） */
export function getComments(
  parentId: string,
  limit = 100,
  offset = 0
): Promise<PostInfo[]> {
  return apiGet<PostInfo[]>("/api/post/comments", {
    params: { parentId, limit, offset },
  });
}

/** 创建评论，返回新评论 ID */
export function createComment(
  parentId: string,
  content: string,
  authorVisible = true
): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/post/comment", {
    parentId,
    content,
    authorVisible,
  });
}
