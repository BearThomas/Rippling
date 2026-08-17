/**
 * 大事记 API（/api/timeline）
 *
 * 提交大事记走工单系统（timeline_submit 类型），
 * GET /my 返回当前用户的大事记工单（映射为 pending/approved/rejected 状态）。
 */

import { apiGet, apiPost } from "./client";
import type { TimelineEvent } from "../types";

/** 提交大事记（创建 timeline_submit 工单） */
export function submitTimeline(input: {
  title: string;
  description: string;
  eventDate: string;
}): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/timeline", input);
}

/** 已批准的大事记列表（公开） */
export function listTimelineEvents(limit = 50, offset = 0): Promise<TimelineEvent[]> {
  return apiGet<TimelineEvent[]>("/api/timeline/list", { params: { limit, offset } });
}

/** 我提交的大事记（工单状态映射） */
export function getMyTimelineSubmissions(): Promise<TimelineEvent[]> {
  return apiGet<TimelineEvent[]>("/api/timeline/my");
}

/** 大事记详情 */
export function getTimelineEvent(id: string): Promise<TimelineEvent> {
  return apiGet<TimelineEvent>("/api/timeline", { params: { id } });
}
