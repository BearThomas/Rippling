/**
 * 提问箱 API 路由
 *
 * 路由表（挂载前缀 /api/question）：
 *   GET    /       获取提问箱设置
 *   PUT    /box    设置提问箱开关（仅主人）
 *   POST   /       提问（ask_question 权限）
 *   GET    /list   问题列表（公开）
 *   POST   /answer 回答问题（仅主人）
 *   DELETE /       软删除问题（仅主人）
 *
 * 安全规则：
 *   - 提问者匿名，askerId 永不返回
 *   - 未回答的问题仅主人可见
 *   - 软删除不物理删除，记录到 archive_operation
 *
 * 频率限制：提问每小时 10 次
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  getQuestionBox,
  setQuestionBoxEnabled,
  createQuestion,
  answerQuestion,
  listQuestions,
  softDeleteQuestion,
} from "../db";
import type { CurrentUser } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import { PERM_ASK_QUESTION } from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 提问箱路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 内容字数上限 */
const LIMITS = {
  QUESTION_CONTENT: 500,
  ANSWER_CONTENT: 500,
} as const;

// ============================================================
//  路由实例
// ============================================================

const questionRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /box  — 获取提问箱设置（公开）
// ------------------------------------------------------------

questionRoutes.get("/box", async (c) => {
  const ownerId = c.req.query("ownerId");
  if (!ownerId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 ownerId 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const box = await getQuestionBox(c.env.DB, ownerId);

  // 不存在则返回默认关闭状态（不暴露用户是否存在）
  if (!box) {
    return c.json({
      success: true,
      data: { enabled: false, onlyFollowers: false },
    });
  }

  return c.json({
    success: true,
    data: { enabled: box.enabled, onlyFollowers: box.onlyFollowers },
  });
});

// ------------------------------------------------------------
//  PUT /box  — 设置提问箱开关（仅主人）
// ------------------------------------------------------------

questionRoutes.put("/box", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
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

  const enabled = body.enabled === true;
  const onlyFollowers = body.onlyFollowers === true;

  await setQuestionBoxEnabled(c.env.DB, user.id, enabled, onlyFollowers);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /  — 提问（ask_question 权限）
// ------------------------------------------------------------

questionRoutes.post("/", requirePermission(PERM_ASK_QUESTION), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 10 次
  const rate = checkRateLimit(user.id, "ask_question", 3600, 10);
  if (rate.limited) {
    return c.json(
      { success: false, error: { code: RATE_LIMITED.code, message: RATE_LIMITED.message } },
      RATE_LIMITED.statusCode as any
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

  const ownerId = body.ownerId as string | undefined;
  const content = (body.content as string | undefined)?.trim();

  if (!ownerId || !content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 ownerId 或 content" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  if (content.length > LIMITS.QUESTION_CONTENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `内容不能超过 ${LIMITS.QUESTION_CONTENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 不能向自己提问
  if (ownerId === user.id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "不能向自己提问" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 查找提问箱
  const box = await getQuestionBox(c.env.DB, ownerId);
  if (!box || !box.enabled) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "提问箱不存在或未启用" } },
      NOT_FOUND.statusCode as any
    );
  }

  const questionId = await createQuestion(c.env.DB, box.id, user.id, content);
  if (!questionId) {
    // createQuestion 返回 null 可能是：提问箱未启用 / 仅关注者模式下未关注
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: "无法提问，请检查提问箱设置" } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true, data: { id: questionId } });
});

// ------------------------------------------------------------
//  GET /list  — 问题列表（公开）
// ------------------------------------------------------------

questionRoutes.get("/list", async (c) => {
  const ownerId = c.req.query("ownerId");
  if (!ownerId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 ownerId 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 50);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);

  const user = c.get("user") as CurrentUser | null;

  const questions = await listQuestions(c.env.DB, ownerId, user, limit, offset);

  // askerId 已在 DAL 层移除，永远不返回
  return c.json({ success: true, data: questions });
});

// ------------------------------------------------------------
//  POST /answer  — 回答问题（仅主人）
// ------------------------------------------------------------

questionRoutes.post("/answer", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
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

  const questionId = body.questionId as string | undefined;
  const answer = (body.answer as string | undefined)?.trim();

  if (!questionId || !answer) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 questionId 或 answer" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  if (answer.length > LIMITS.ANSWER_CONTENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `回答不能超过 ${LIMITS.ANSWER_CONTENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await answerQuestion(c.env.DB, questionId, answer, user.id);
  if (!ok) {
    // 零信任：问题不存在或不属于该 owner → 404
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  DELETE /  — 软删除问题（仅主人）
// ------------------------------------------------------------

questionRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  const questionId = c.req.query("questionId");
  if (!questionId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 questionId 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await softDeleteQuestion(c.env.DB, questionId, user.id);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default questionRoutes;
