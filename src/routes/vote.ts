/**
 * 投票 API 路由
 *
 * 路由表（挂载前缀 /api/vote）：
 *   GET  /list   投票列表（含 totalVotes）
 *   GET  /       单条投票详情（含选项 + 票数 + myVote）
 *   POST /       创建投票
 *   POST /cast   投票（单选 / 多选）
 *   POST /close  关闭投票
 *
 * 所有写操作需认证 + 权限检查。
 * DAL 返回 null / false → 统一 404（不暴露隐藏 ID）。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  listVotes,
  createVote,
  getVoteById,
  castVote,
  closeVote,
} from "../db";
import type { CurrentUser } from "../utils/permission";
import { PERM_CREATE_VOTE } from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 投票路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 字数上限 */
const LIMITS = {
  TITLE: 100,
  DESCRIPTION: 500,
} as const;

// ============================================================
//  路由实例
// ============================================================

const voteRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /list  — 投票列表
// ------------------------------------------------------------

voteRoutes.get("/list", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const votes = await listVotes(c.env.DB, limit, offset);

  // description 截断预览（100 字）
  const items = votes.map((v) => ({
    id: v.id,
    title: v.title,
    description:
      v.description && v.description.length > 100
        ? v.description.slice(0, 100) + "..."
        : v.description,
    endAt: v.endAt,
    isClosed: v.isClosed,
    createdAt: v.createdAt,
    totalVotes: v.totalVotes,
  }));

  return c.json({ success: true, data: items });
});

// ------------------------------------------------------------
//  GET /  — 单条投票详情
// ------------------------------------------------------------

voteRoutes.get("/", async (c) => {
  const id = c.req.query("id");
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const user = c.get("user");
  const vote = await getVoteById(c.env.DB, id, user);
  if (!vote) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true, data: vote });
});

// ------------------------------------------------------------
//  POST /  — 创建投票
// ------------------------------------------------------------

voteRoutes.post("/", requirePermission(PERM_CREATE_VOTE), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求体格式错误" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const title = (body.title as string) ?? "";
  const description = (body.description as string) ?? null;
  const isMultiple = (body.isMultiple as boolean) ?? false;
  const isRealTimeVisible = (body.isRealTimeVisible as boolean) ?? true;
  const endAt = (body.endAt as string) ?? "";
  const options = body.options as string[];

  // 参数校验
  if (!title) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "标题不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (title.length > LIMITS.TITLE) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `标题最多 ${LIMITS.TITLE} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (description && description.length > LIMITS.DESCRIPTION) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `描述最多 ${LIMITS.DESCRIPTION} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!endAt || isNaN(Date.parse(endAt))) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "endAt 须为有效的 ISO 8601 日期" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!Array.isArray(options) || options.length < 2) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "至少需要 2 个选项" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  // 校验每个选项非空
  for (const opt of options) {
    if (typeof opt !== "string" || !opt.trim()) {
      return c.json(
        { success: false, error: { code: VALIDATION_ERROR.code, message: "选项内容不能为空" } },
        VALIDATION_ERROR.statusCode as any
      );
    }
  }

  const id = await createVote(
    c.env.DB,
    { title, description, isMultiple, isRealTimeVisible, endAt, options },
    user as CurrentUser
  );
  if (!id) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  POST /cast  — 投票（单选 / 多选）
// ------------------------------------------------------------

voteRoutes.post("/cast", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求体格式错误" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const voteId = body.voteId as string;
  const optionIds = body.optionIds as string[];

  // 参数校验
  if (!voteId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 voteId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 optionIds" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await castVote(c.env.DB, voteId, optionIds, user.id);
  if (!ok) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "投票失败（已截止、已投过或参数无效）" } },
      400 as any
    );
  }

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /close  — 关闭投票
// ------------------------------------------------------------

voteRoutes.post("/close", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求体格式错误" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = body.id as string;
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await closeVote(c.env.DB, id, user as CurrentUser);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default voteRoutes;
