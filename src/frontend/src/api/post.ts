/**
 * 帖子 API（/api/post）
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { PostInfo } from "../types";

/** 发帖参数 */
export interface CreatePostInput {
  content: string;
  title?: string;
  parentId?: string;
  visibility?: "public" | "private" | "specified";
  blockId?: string;
  visibleUserIds?: string[];
}

/** 编辑帖子参数 */
export interface UpdatePostInput {
  postId: string;
  content?: string;
  title?: string;
  visibility?: "public" | "private" | "specified";
  visibleUserIds?: string[];
}

/** 获取单个帖子详情 */
export function getPost(id: string): Promise<PostInfo> {
  return apiGet<PostInfo>("/api/post", { params: { id } });
}

/** 创建帖子（或评论，带 parentId 时为评论） */
export function createPost(input: CreatePostInput): Promise<PostInfo> {
  return apiPost<PostInfo>("/api/post", input);
}

/** 编辑自己的帖子 */
export function updatePost(input: UpdatePostInput): Promise<PostInfo> {
  return apiPut<PostInfo>("/api/post", input);
}

/** 删除自己的帖子 */
export function deletePost(postId: string): Promise<void> {
  return apiDelete<void>("/api/post", { body: { postId } });
}

/** 获取帖子的评论列表 */
export function getComments(postId: string): Promise<PostInfo[]> {
  return apiGet<PostInfo[]>("/api/post/comments", { params: { postId } });
}

/** 置顶 / 取消置顶帖子（pin_post 权限） */
export function pinPost(postId: string, pin: boolean): Promise<void> {
  return apiPost<void>("/api/post/pin", { postId, pin });
}
