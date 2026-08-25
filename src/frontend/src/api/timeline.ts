/**
 * 大事记 API（/api/timeline）
 *
 * 注意：提交大事记已改走工单系统（POST /api/ticket，type='timeline_submit'，
 * extraData 携带 eventDate），请使用 api/ticket.ts 的 createTicket，
 * 本模块不再封装旧版 POST /api/timeline 提交接口。
 */

import { apiGet, apiPost } from "./client";
import type { TimelineEvent, TimelineSubmission, PostInfo } from "../types";

/** 已批准的大事记列表（公开，按 eventDate 倒序，description 为预览） */
export function getTimelineList(limit = 20, offset = 0): Promise<TimelineEvent[]> {
  return apiGet<TimelineEvent[]>("/api/timeline/list", { params: { limit, offset } });
}

/** 大事记详情（完整描述 + likeCount；审核信息按权限附加） */
export function getTimelineDetail(id: string): Promise<TimelineEvent> {
  return apiGet<TimelineEvent>("/api/timeline", { params: { id } });
}

/** 我提交的大事记（timeline_submit 工单状态映射，需登录） */
export function getMyTimelineSubmissions(): Promise<TimelineSubmission[]> {
  return apiGet<TimelineSubmission[]>("/api/timeline/my");
}

// ============================================================
//  大事记评论（复用评论组件体系，targetType = timeline）
// ============================================================

/** 大事记顶级评论列表（后端已附加 author / likeCount / liked） */
export function getTimelineComments(
  timelineId: string,
  limit = 100,
  offset = 0
): Promise<PostInfo[]> {
  return apiGet<PostInfo[]>("/api/timeline/comments", {
    params: { timelineId, limit, offset },
  });
}

/** 发表大事记评论，返回新评论 ID（子回复仍走 api/post.ts createComment） */
export function createTimelineComment(
  timelineId: string,
  content: string,
  authorVisible = true
): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/timeline/comment", {
    timelineId,
    content,
    authorVisible,
  });
}
