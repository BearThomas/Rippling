/**
 * 大事记 API 路由
 *
 * 路由表（挂载前缀 /api/timeline）：
 *   GET  /list    大事记列表（仅 approved，含 likeCount）
 *   GET  /my      当前用户提交的所有大事记（含各状态）
 *   GET  /        单条大事记详情（含 likeCount + 用户名）
 *   POST /        提交大事记
 *   POST /review  审核大事记（通过 / 拒绝）
 *
 * 所有写操作需认证 + 权限检查 + 频率限制（临时内存方案）。
 * DAL 返回 null / false → 统一 404（不暴露隐藏 ID）。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  listTimelineEvents,
  getTimelineEventById,
  submitTimeline,
  reviewTimeline,
  listUserTimelines,
  getTimelineReviewInfo,
  getLikeCount,
} from "../db";
import type { TimelineEventInfo } from "../db/timeline";
import type { ArchiveEnv } from "../utils/archive";
import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import {
  PERM_SUBMIT_TIMELINE,
  PERM_REVIEW_TIMELINE,
} from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 大事记路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 字数上限 */
const LIMITS = {
  TITLE: 100,
  DESCRIPTION: 1000,
} as const;

/** 列表 description 预览截断长度 */
const PREVIEW_LENGTH = 100;

/** eventDate 格式：YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================
//  辅助函数
// ============================================================

/**
 * 从 user_profile 批量解析 userId → username
 *
 * 返回 Map<userId, username>，查不到的 userId 不出现在 Map 中。
 */
async function resolveUsernames(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds)];

  await Promise.all(
    unique.map(async (uid) => {
      const row = await db
        .prepare("SELECT username FROM user_profile WHERE userId = ?")
        .bind(uid)
        .first<{ username: string }>();
      if (row) map.set(uid, row.username);
    })
  );

  return map;
}

// ============================================================
//  路由实例
// ============================================================

const timelineRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /list  — 大事记列表（仅 approved）
// ------------------------------------------------------------

timelineRoutes.get("/list", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const user = c.get("user");

  const events = await listTimelineEvents(c.env.DB, user, limit, offset);

  // 批量解析 submittedBy → username + 查询 likeCount
  const usernames = await resolveUsernames(
    c.env.DB,
    events.map((e) => e.submittedBy)
  );

  const items = await Promise.all(
    events.map(async (event: TimelineEventInfo) => {
      const likeCount = await getLikeCount(c.env.DB, "timeline", event.id);

      // description 截断预览
      const descriptionPreview =
        event.description.length > PREVIEW_LENGTH
          ? event.description.slice(0, PREVIEW_LENGTH) + "..."
          : event.description;

      return {
        id: event.id,
        title: event.title,
        description: descriptionPreview,
        eventDate: event.eventDate,
        submittedBy: usernames.get(event.submittedBy) ?? null,
        createdAt: event.createdAt,
        likeCount,
      };
    })
  );

  return c.json({ success: true, data: items });
});

// ------------------------------------------------------------
//  GET /my  — 当前用户提交的所有大事记（含各审核状态）
// ------------------------------------------------------------

timelineRoutes.get("/my", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  const events = await listUserTimelines(c.env.DB, user.id);

  return c.json({ success: true, data: events });
});

// ------------------------------------------------------------
//  GET /  — 单条大事记详情
// ------------------------------------------------------------

timelineRoutes.get("/", async (c) => {
  const id = c.req.query("id");
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const user = c.get("user");
  const archiveEnv: ArchiveEnv = {
    ENCRYPTION_KEY: c.env.ENCRYPTION_KEY ?? "",
    SITE_URL: new URL(c.req.url).origin,
  };

  const event = await getTimelineEventById(c.env.DB, id, user, archiveEnv);
  if (!event) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  // 查询点赞数
  const likeCount = await getLikeCount(c.env.DB, "timeline", event.id);

  // 解析提交人用户名
  const profileRow = await c.env.DB
    .prepare("SELECT username FROM user_profile WHERE userId = ?")
    .bind(event.submittedBy)
    .first<{ username: string }>();

  // 构建返回数据
  const data: Record<string, unknown> = {
    id: event.id,
    title: event.title,
    description: event.description,
    eventDate: event.eventDate,
    submittedBy: profileRow?.username ?? null,
    createdAt: event.createdAt,
    likeCount,
  };

  // 提交者本人或管理员可查看审核信息
  if (user && (user.id === event.submittedBy || can(user, PERM_REVIEW_TIMELINE))) {
    const reviewInfo = await getTimelineReviewInfo(c.env.DB, event.id);
    if (reviewInfo) {
      // 解析审核人用户名
      let reviewerName: string | null = null;
      if (reviewInfo.reviewedBy) {
        const reviewerRow = await c.env.DB
          .prepare("SELECT username FROM user_profile WHERE userId = ?")
          .bind(reviewInfo.reviewedBy)
          .first<{ username: string }>();
        reviewerName = reviewerRow?.username ?? null;
      }

      data.reviewedBy = reviewerName;
      data.reviewedAt = reviewInfo.reviewedAt;
    }
  }

  return c.json({ success: true, data });
});

// ------------------------------------------------------------
//  POST /  — 提交大事记
// ------------------------------------------------------------

timelineRoutes.post("/", requirePermission(PERM_SUBMIT_TIMELINE), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 3 条
  const rate = checkRateLimit(user.id, "submit_timeline", 3600, 3);
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

  const title = (body.title as string) ?? "";
  const description = (body.description as string) ?? "";
  const eventDate = (body.eventDate as string) ?? "";

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
  if (!description) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "描述不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (description.length > LIMITS.DESCRIPTION) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `描述最多 ${LIMITS.DESCRIPTION} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!DATE_REGEX.test(eventDate)) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "日期格式须为 YYYY-MM-DD" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = await submitTimeline(c.env.DB, { title, description, eventDate }, user as CurrentUser);
  if (!id) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  POST /review  — 审核大事记（通过 / 拒绝）
// ------------------------------------------------------------

timelineRoutes.post("/review", requirePermission(PERM_REVIEW_TIMELINE), async (c) => {
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

  const id = body.id as string;
  const status = body.status as string;
  const reason = (body.reason as string) ?? undefined;

  // 参数校验
  if (!id) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 id" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (status !== "approved" && status !== "rejected") {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "status 须为 approved 或 rejected" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  // 拒绝时 reason 必填
  if (status === "rejected" && !reason) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "拒绝时必须填写原因" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const ok = await reviewTimeline(c.env.DB, id, status as "approved" | "rejected", user as CurrentUser, reason);
  if (!ok) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  return c.json({ success: true });
});

export default timelineRoutes;
