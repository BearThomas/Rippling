/**
 * 工单 API 路由
 *
 * 路由表（挂载前缀 /api/ticket）：
 *   POST /                创建工单（按类型检查提交权限）
 *   GET  /my              我的工单列表
 *   GET  /my-verification 我的认证工单状态
 *   GET  /list            工单列表（view_ticket，可按 status / type 筛选）
 *   GET  /                工单详情（本人或 view_ticket）
 *   POST /handle          处理工单（handle_ticket）
 *
 * 工单类型：
 *   permission_request / report / appeal / verification /
 *   block_create / account_deletion / timeline_submit
 *
 * 约束：
 *   - 无权限一律 404（不暴露资源存在性）
 *   - 所有处理操作写 admin_log（action = 'handle_ticket'）
 *   - 处理结果通过 notification 通知提交者
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { TicketInfo } from "../db/ticket";
import {
  createTicket,
  getMyTickets,
  getMyVerificationTicket,
  listTickets,
  listTicketsByType,
  getTicketById,
  updateTicketStatus,
  softDeletePost,
  softDeleteConfession,
  createBlock,
  createTimelineFromTicket,
  deactivateUser,
  reactivateUser,
  incrementViolationCount,
  setUserPermissionsDirect,
  getUserPermissions,
  updateUserNameColor,
  updateUsername,
  createNotification,
  writeAdminLog,
} from "../db";
import {
  PERM_SUBMIT_PERMISSION_REQUEST,
  PERM_SUBMIT_REPORT,
  PERM_SUBMIT_APPEAL,
  PERM_SUBMIT_VERIFICATION,
  PERM_SUBMIT_BLOCK_CREATE,
  PERM_SUBMIT_TIMELINE,
  PERM_VIEW_TICKET,
  PERM_HANDLE_TICKET,
  PERM_UPLOAD_IMAGE,
  PERM_CREATE_CONFESSION,
  PERM_CREATE_VOTE,
  MASK_VIEW_SITE,
  MASK_SUBMIT_TIMELINE,
  MASK_MANAGE_BLOCK,
  DEFAULT_USER_PERMISSIONS,
} from "../shared/permissions";
import { checkRateLimit } from "../utils/rate-limit";
import {
  UNAUTHORIZED,
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 工单路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 处理动作 */
type HandleAction = "approve" | "reject" | "ignore" | "warn" | "punish" | "ban";

// ============================================================
//  常量配置
// ============================================================

/** 工单类型 → 提交所需权限位 */
const TICKET_TYPE_PERMISSIONS: Record<string, number | null> = {
  permission_request: PERM_SUBMIT_PERMISSION_REQUEST,
  report: PERM_SUBMIT_REPORT,
  appeal: PERM_SUBMIT_APPEAL,
  verification: PERM_SUBMIT_VERIFICATION,
  block_create: PERM_SUBMIT_BLOCK_CREATE,
  account_deletion: null,
  timeline_submit: PERM_SUBMIT_TIMELINE,
};

/** 工单类型中文名（用于通知文案） */
const TICKET_TYPE_LABELS: Record<string, string> = {
  permission_request: "权限申请",
  report: "举报",
  appeal: "申诉",
  verification: "认证",
  block_create: "创建板块",
  account_deletion: "账号注销",
  timeline_submit: "大事记提交",
};

/** 处理动作中文名（用于通知文案） */
const ACTION_LABELS: Record<HandleAction, string> = {
  approve: "已通过",
  reject: "已拒绝",
  ignore: "已忽略",
  warn: "已被警告",
  punish: "已被处罚",
  ban: "已被封禁",
};

/** 各类型允许的处理动作 */
const ALLOWED_ACTIONS: Record<string, HandleAction[]> = {
  permission_request: ["approve", "reject"],
  report: ["ignore", "warn", "punish", "ban"],
  appeal: ["approve", "reject"],
  verification: ["approve", "reject"],
  block_create: ["approve", "reject"],
  account_deletion: ["approve", "reject"],
  timeline_submit: ["approve", "reject"],
};

/** 用户可申请的权限白名单：权限名 → 权限位（权限名需写在工单 title 中） */
const REQUESTABLE_PERMISSIONS: Record<string, number> = {
  upload_image: PERM_UPLOAD_IMAGE,
  submit_timeline: PERM_SUBMIT_TIMELINE,
  create_confession: PERM_CREATE_CONFESSION,
  create_vote: PERM_CREATE_VOTE,
};

/** 举报目标类型白名单 */
const REPORT_TARGET_TYPES = ["post", "comment", "confession"] as const;

/** 违规次数封禁阈值：达到该次数自动封禁 */
const VIOLATION_BAN_THRESHOLD = 3;

/** 认证用户昵称颜色（浅蓝） */
const VERIFIED_NAME_COLOR = "#60A5FA";

/** 字数上限 */
const LIMITS = {
  TITLE: 100,
  CONTENT: 2000,
} as const;

/** eventDate 格式：YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================
//  辅助函数
// ============================================================

/** 统一错误响应 */
function errorResponse(
  c: any,
  err: { statusCode: number; code: string; message: string },
  message?: string
) {
  return c.json(
    { success: false, error: { code: err.code, message: message ?? err.message } },
    err.statusCode as any
  );
}

/**
 * 解析 title 中申请的权限名
 *
 * @returns 权限位；title 中未包含任何可申请权限名时返回 null
 */
function resolveRequestedPermissionBit(title: string): number | null {
  for (const [name, bit] of Object.entries(REQUESTABLE_PERMISSIONS)) {
    if (title.includes(name)) return bit;
  }
  return null;
}

/**
 * 解析举报目标内容的作者
 *
 * post / comment 均在 post 表中（comment 是有 parentId 的 post）。
 *
 * @returns 作者 ID；目标不存在或已删除返回 null
 */
async function resolveReportTargetAuthor(
  db: D1Database,
  targetType: string,
  targetId: string
): Promise<string | null> {
  if (targetType === "post" || targetType === "comment") {
    const row = await db
      .prepare("SELECT authorId FROM post WHERE id = ? AND isDeleted = 0")
      .bind(targetId)
      .first<{ authorId: string }>();
    return row?.authorId ?? null;
  }

  if (targetType === "confession") {
    const row = await db
      .prepare("SELECT authorId FROM confession WHERE id = ? AND isDeleted = 0")
      .bind(targetId)
      .first<{ authorId: string }>();
    return row?.authorId ?? null;
  }

  return null;
}

/**
 * 封禁用户：权限掩码清零，只保留 view_site
 */
async function banUserFromReport(db: D1Database, userId: string): Promise<boolean> {
  return setUserPermissionsDirect(db, userId, MASK_VIEW_SITE);
}

// ============================================================
//  各类型工单的处理逻辑
//
//  返回值：处理结果描述（写入 ticket.result + 通知内容），
//  失败时抛出 Error 由调用方转为 400。
// ============================================================

/** 权限申请：approve 自动赋权 */
async function handlePermissionRequest(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  // 从 title 中解析申请的权限名
  const bit = resolveRequestedPermissionBit(ticket.title);
  if (bit === null) {
    throw new Error("工单标题中未包含可申请的权限名");
  }
  const permName = Object.entries(REQUESTABLE_PERMISSIONS).find(
    ([, b]) => b === bit
  )![0];

  const current = (await getUserPermissions(db, ticket.submittedBy)) ?? 0n;
  const next = current | (1n << BigInt(bit));
  await setUserPermissionsDirect(db, ticket.submittedBy, next);

  return `已批准，授予权限：${permName}`;
}

/** 举报：ignore / warn / punish / ban，违规满 3 次自动封禁 */
async function handleReport(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  admin: CurrentUser
): Promise<string> {
  // 忽略：仅关闭工单，不处罚
  if (action === "ignore") return "已忽略，不作处罚";

  const authorId =
    ticket.targetType && ticket.targetId
      ? await resolveReportTargetAuthor(db, ticket.targetType, ticket.targetId)
      : null;

  if (!authorId) {
    throw new Error("举报目标不存在或已删除");
  }

  let detail = "";

  // 处罚：先软删除被举报内容
  if (action === "punish") {
    let deleted = false;
    if (ticket.targetType === "confession") {
      deleted = await softDeleteConfession(db, ticket.targetId!, admin);
    } else {
      // post / comment 均在 post 表
      deleted = await softDeletePost(db, ticket.targetId!, admin);
    }
    detail = deleted ? "内容已删除，" : "内容删除失败（可能已被删除），";
  }

  // 封禁：直接封禁，不累加违规次数
  if (action === "ban") {
    await banUserFromReport(db, authorId);
    return `${detail}已封禁被举报用户`;
  }

  // 警告 / 处罚：累加违规次数，达到阈值自动封禁
  const count = await incrementViolationCount(db, authorId);
  if (count >= VIOLATION_BAN_THRESHOLD) {
    await banUserFromReport(db, authorId);
    return `${detail}违规次数达 ${count} 次，已自动封禁`;
  }

  return `${detail}已记录违规（当前 ${count} 次）`;
}

/** 申诉：approve 恢复注册用户默认权限 + 解除注销 */
async function handleAppeal(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  await setUserPermissionsDirect(db, ticket.submittedBy, DEFAULT_USER_PERMISSIONS);
  // 顺带解除注销状态（若账号已被注销）
  await reactivateUser(db, ticket.submittedBy);

  return "已批准，恢复默认权限";
}

/** 认证：approve 添加 submit_timeline 权限 + 昵称改浅蓝 */
async function handleVerification(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  const current = (await getUserPermissions(db, ticket.submittedBy)) ?? 0n;
  await setUserPermissionsDirect(db, ticket.submittedBy, current | MASK_SUBMIT_TIMELINE);
  await updateUserNameColor(db, ticket.submittedBy, VERIFIED_NAME_COLOR);

  return "已批准，认证通过";
}

/** 创建板块：approve 自动建板，申请人为 owner */
async function handleBlockCreate(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined,
  admin: CurrentUser
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  // 工单系统授权：handle_ticket 处理建板工单等价于 manage_block，
  // 叠加掩码以满足 createBlock 的权限检查（DAL 不感知工单上下文）
  const elevated: CurrentUser = {
    ...admin,
    permissions: admin.permissions | MASK_MANAGE_BLOCK,
  };

  const blockId = await createBlock(
    db,
    { name: ticket.title, description: ticket.content, ownerId: ticket.submittedBy },
    elevated
  );

  if (!blockId) {
    throw new Error("板块创建失败（板块名可能已存在）");
  }

  return `已批准，板块已创建（id=${blockId}）`;
}

/** 账号注销：approve 注销账号 + 用户名改为 UnknownUser */
async function handleAccountDeletion(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  const ok = await deactivateUser(db, ticket.submittedBy);
  if (!ok) {
    throw new Error("用户不存在，注销失败");
  }

  // 用户名显示为 UnknownUser（UNIQUE 冲突时用 userId 短码作后缀）
  const renamed = await updateUsername(db, ticket.submittedBy, "UnknownUser");
  if (!renamed) {
    await updateUsername(db, ticket.submittedBy, `UnknownUser_${ticket.submittedBy.slice(0, 8)}`);
  }

  return "已批准，账号已注销";
}

/** 大事记提交：approve 创建 approved 大事记 */
async function handleTimelineSubmit(
  db: D1Database,
  ticket: TicketInfo,
  action: HandleAction,
  reason: string | undefined,
  handlerId: string
): Promise<string> {
  if (action === "reject") {
    return `已拒绝：${reason ?? ""}`;
  }

  // 审核人 = 当前处理人（工单此刻尚未写入 assignedTo，手动补齐）
  const eventId = await createTimelineFromTicket(
    db,
    { ...ticket, assignedTo: handlerId },
    ticket.submittedBy
  );

  if (!eventId) {
    throw new Error("工单 extraData 缺少 eventDate，无法创建大事记");
  }

  return `已批准，大事记已发布（id=${eventId}）`;
}

// ============================================================
//  路由实例
// ============================================================

const ticketRoutes = new Hono<E>();

// ------------------------------------------------------------
//  POST /  — 创建工单
// ------------------------------------------------------------

ticketRoutes.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const type = (body.type as string) ?? "";
  const title = (body.title as string) ?? "";
  const content = (body.content as string) ?? "";
  const targetType = (body.targetType as string) ?? undefined;
  const targetId = (body.targetId as string) ?? undefined;
  const extraData = (body.extraData as Record<string, unknown> | undefined) ?? undefined;

  // 工单类型校验
  if (!(type in TICKET_TYPE_PERMISSIONS)) {
    return errorResponse(c, VALIDATION_ERROR, "未知的工单类型");
  }

  // 提交权限检查（无权限 = 404）
  const permBit = TICKET_TYPE_PERMISSIONS[type];
  if (permBit !== null && !can(user as CurrentUser, permBit)) {
    return errorResponse(c, NOT_FOUND);
  }

  // 频率限制：每用户每小时每类型最多 5 单
  const rate = checkRateLimit(user.id, `ticket_${type}`, 3600, 5);
  if (rate.limited) return errorResponse(c, RATE_LIMITED);

  // 基础字段校验
  if (!title || title.length > LIMITS.TITLE) {
    return errorResponse(c, VALIDATION_ERROR, `标题不能为空且最多 ${LIMITS.TITLE} 字`);
  }
  if (!content || content.length > LIMITS.CONTENT) {
    return errorResponse(c, VALIDATION_ERROR, `内容不能为空且最多 ${LIMITS.CONTENT} 字`);
  }

  // 类型特定校验
  if (type === "report") {
    // 举报必须指明目标
    if (!targetType || !REPORT_TARGET_TYPES.includes(targetType as any)) {
      return errorResponse(c, VALIDATION_ERROR, "targetType 须为 post / comment / confession");
    }
    if (!targetId) {
      return errorResponse(c, VALIDATION_ERROR, "举报必须提供 targetId");
    }
  }

  if (type === "timeline_submit") {
    // 大事记提交必须携带 eventDate（存 extraData）
    const eventDate = (extraData?.eventDate as string) ?? "";
    if (!DATE_REGEX.test(eventDate)) {
      return errorResponse(c, VALIDATION_ERROR, "extraData.eventDate 格式须为 YYYY-MM-DD");
    }
  }

  if (type === "permission_request") {
    // title 必须包含可申请的权限名，否则批准时无法定位权限
    if (resolveRequestedPermissionBit(title) === null) {
      return errorResponse(
        c,
        VALIDATION_ERROR,
        `标题须包含申请的权限名（${Object.keys(REQUESTABLE_PERMISSIONS).join(" / ")}）`
      );
    }
  }

  const id = await createTicket(c.env.DB, {
    type,
    title,
    content,
    submittedBy: user.id,
    targetType,
    targetId,
    extraData,
  });

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  GET /my  — 我的工单列表
// ------------------------------------------------------------

ticketRoutes.get("/my", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const tickets = await getMyTickets(c.env.DB, user.id, limit, offset);

  return c.json({ success: true, data: tickets });
});

// ------------------------------------------------------------
//  GET /my-verification  — 我的认证工单状态
// ------------------------------------------------------------

ticketRoutes.get("/my-verification", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  const ticket = await getMyVerificationTicket(c.env.DB, user.id);

  if (!ticket) {
    return c.json({
      success: true,
      data: { exists: false, status: null, ticketId: null },
    });
  }

  return c.json({
    success: true,
    data: { exists: true, status: ticket.status, ticketId: ticket.id },
  });
});

// ------------------------------------------------------------
//  GET /list  — 工单列表（view_ticket 权限）
// ------------------------------------------------------------

ticketRoutes.get("/list", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_VIEW_TICKET)) {
    return errorResponse(c, NOT_FOUND);
  }

  const status = c.req.query("status") ?? null;
  const type = c.req.query("type") ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const tickets = type
    ? await listTicketsByType(c.env.DB, type, status, limit, offset)
    : await listTickets(c.env.DB, user as CurrentUser, status, limit, offset);

  return c.json({ success: true, data: tickets });
});

// ------------------------------------------------------------
//  GET /  — 工单详情（本人或 view_ticket）
// ------------------------------------------------------------

ticketRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  const id = c.req.query("id");
  if (!id) return errorResponse(c, VALIDATION_ERROR, "缺少 id 参数");

  const ticket = await getTicketById(c.env.DB, id, user as CurrentUser);
  if (!ticket) return errorResponse(c, NOT_FOUND);

  return c.json({ success: true, data: ticket });
});

// ------------------------------------------------------------
//  POST /handle  — 处理工单（handle_ticket 权限）
// ------------------------------------------------------------

ticketRoutes.post("/handle", async (c) => {
  const user = c.get("user");
  if (!user) return errorResponse(c, UNAUTHORIZED);

  // 无权限 = 404
  if (!can(user as CurrentUser, PERM_HANDLE_TICKET)) {
    return errorResponse(c, NOT_FOUND);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(c, VALIDATION_ERROR, "请求体格式错误");
  }

  const id = (body.id as string) ?? "";
  const action = (body.action as string) ?? "";
  const reason = (body.reason as string) ?? undefined;

  if (!id) return errorResponse(c, VALIDATION_ERROR, "缺少 id");
  if (!["approve", "reject", "ignore", "warn", "punish", "ban"].includes(action)) {
    return errorResponse(c, VALIDATION_ERROR, "action 须为 approve / reject / ignore / warn / punish / ban");
  }

  // 查找工单（getTicketById 已含 view_ticket 可见性）
  const ticket = await getTicketById(c.env.DB, id, user as CurrentUser);
  if (!ticket) return errorResponse(c, NOT_FOUND);

  // 仅 open 状态可处理
  if (ticket.status !== "open") {
    return errorResponse(c, VALIDATION_ERROR, "工单已被处理");
  }

  // 动作与类型匹配校验
  if (!ALLOWED_ACTIONS[ticket.type]?.includes(action as HandleAction)) {
    return errorResponse(c, VALIDATION_ERROR, `工单类型 ${ticket.type} 不支持动作 ${action}`);
  }

  // 拒绝时必须填写原因
  if (action === "reject" && !reason) {
    return errorResponse(c, VALIDATION_ERROR, "拒绝时必须填写原因");
  }

  const admin = user as CurrentUser;

  // 按类型分发执行
  let resultText: string;
  try {
    switch (ticket.type) {
      case "permission_request":
        resultText = await handlePermissionRequest(c.env.DB, ticket, action as HandleAction, reason);
        break;
      case "report":
        resultText = await handleReport(c.env.DB, ticket, action as HandleAction, admin);
        break;
      case "appeal":
        resultText = await handleAppeal(c.env.DB, ticket, action as HandleAction, reason);
        break;
      case "verification":
        resultText = await handleVerification(c.env.DB, ticket, action as HandleAction, reason);
        break;
      case "block_create":
        resultText = await handleBlockCreate(c.env.DB, ticket, action as HandleAction, reason, admin);
        break;
      case "account_deletion":
        resultText = await handleAccountDeletion(c.env.DB, ticket, action as HandleAction, reason);
        break;
      case "timeline_submit":
        resultText = await handleTimelineSubmit(c.env.DB, ticket, action as HandleAction, reason, user.id);
        break;
      default:
        return errorResponse(c, VALIDATION_ERROR, "未知的工单类型");
    }
  } catch (err) {
    return errorResponse(c, VALIDATION_ERROR, err instanceof Error ? err.message : "处理失败");
  }

  // 更新工单状态为 closed，记录处理人与结果
  const updated = await updateTicketStatus(c.env.DB, id, "closed", resultText, user.id, admin);
  if (!updated) return errorResponse(c, NOT_FOUND);

  // 写管理日志（统一走 writeAdminLog）
  await writeAdminLog(c.env.DB, {
    adminId: user.id,
    action: "handle_ticket",
    targetType: "ticket",
    targetId: id,
    detail: JSON.stringify({
      type: ticket.type,
      action,
      reason: reason ?? null,
      result: resultText,
    }),
  });

  // 通知提交者处理结果
  await createNotification(c.env.DB, {
    userId: ticket.submittedBy,
    type: "system",
    targetType: "ticket",
    targetId: id,
    content: `你的工单（${TICKET_TYPE_LABELS[ticket.type] ?? ticket.type}）${ACTION_LABELS[action as HandleAction]}：${resultText}`,
  });

  return c.json({ success: true, data: { id, result: resultText } });
});

export default ticketRoutes;
