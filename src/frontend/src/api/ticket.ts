/**
 * 工单 API（/api/ticket）
 */

import { apiGet, apiPost } from "./client";
import type { TicketInfo, TicketType } from "../types";

/** 创建工单参数 */
export interface CreateTicketInput {
  type: TicketType;
  title: string;
  content: string;
  targetType?: string;
  targetId?: string;
  /** 扩展数据（如 timeline_submit 的 eventDate） */
  extraData?: Record<string, unknown>;
}

/** 处理工单动作 */
export type HandleAction = "approve" | "reject" | "ignore" | "warn" | "punish" | "ban";

/** 创建工单（后端只返回新工单 ID） */
export function createTicket(input: CreateTicketInput): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/ticket", input);
}

/** 我的工单列表 */
export function getMyTickets(limit = 50, offset = 0): Promise<TicketInfo[]> {
  return apiGet<TicketInfo[]>("/api/ticket/my", { params: { limit, offset } });
}

/** 工单列表（view_ticket 权限，可按类型/状态筛选） */
export function listTickets(params: {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<TicketInfo[]> {
  return apiGet<TicketInfo[]>("/api/ticket/list", { params });
}

/** 工单详情 */
export function getTicket(id: string): Promise<TicketInfo> {
  return apiGet<TicketInfo>("/api/ticket", { params: { id } });
}

/** 处理工单（handle_ticket 权限） */
export function handleTicket(
  id: string,
  action: HandleAction,
  reason?: string
): Promise<TicketInfo> {
  return apiPost<TicketInfo>("/api/ticket/handle", { id, action, reason });
}
