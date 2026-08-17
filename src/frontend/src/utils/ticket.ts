/**
 * 工单类型 / 状态 / 处理动作的中文映射
 *
 * 供工单列表、工单详情、管理面板概览复用，避免重复定义。
 */

/** 工单类型中文名 */
export const TICKET_TYPE_LABELS: Record<string, string> = {
  permission_request: "权限申请",
  report: "举报",
  appeal: "申诉",
  verification: "认证申请",
  block_create: "创建板块",
  account_deletion: "账号注销",
  timeline_submit: "大事记提交",
};

/** 工单状态中文名 */
export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  processing: "处理中",
  closed: "已关闭",
};

/** 处理动作中文名 */
export const HANDLE_ACTION_LABELS: Record<string, string> = {
  approve: "批准",
  reject: "拒绝",
  ignore: "忽略",
  warn: "警告",
  punish: "处罚",
  ban: "封禁",
};

/**
 * 各工单类型允许的处理动作（与后端 ALLOWED_ACTIONS 严格一致）
 */
export const TICKET_ALLOWED_ACTIONS: Record<string, string[]> = {
  permission_request: ["approve", "reject"],
  report: ["ignore", "warn", "punish", "ban"],
  appeal: ["approve", "reject"],
  verification: ["approve", "reject"],
  block_create: ["approve", "reject"],
  account_deletion: ["approve", "reject"],
  timeline_submit: ["approve", "reject"],
};

/** 工单类型中文名（未知类型原样返回） */
export function ticketTypeLabel(type: string): string {
  return TICKET_TYPE_LABELS[type] ?? type;
}

/** 工单状态中文名（未知状态原样返回） */
export function ticketStatusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}
