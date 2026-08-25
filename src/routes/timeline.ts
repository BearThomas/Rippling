/**
 * 大事记 API 路由
 *
 * 路由表（挂载前缀 /api/timeline）：
 *   GET  /list     大事记列表（仅 approved，含 likeCount）
 *   GET  /my       当前用户提交的大事记工单（timeline_submit）
 *   GET  /         单条大事记详情（含 likeCount + 用户名）
 *   POST /         提交大事记（创建 timeline_submit 工单，审核走工单系统）
 *   GET  /comments 大事记评论列表（复用 post 表，parentId = timelineId）
 *   POST /comment  发表大事记评论
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
  getTimelineReviewInfo,
  getLikeCount,
  createTicket,
  getMyTickets,
  createTimelineComment,
  listPostsByParent,
  enrichPosts,
  createNotification,
} from "../db";
import type { TimelineEventInfo } from "../db/timeline";
import type { ArchiveEnv } from "../utils/archive";
import { can } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import {
  PERM_SUBMIT_TIMELINE,
  PERM_REVIEW_TIMELINE,
  PERM_COMMENT,
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
  COMMENT: 300,
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
//  GET /my  — 当前用户提交的大事记工单（timeline_submit）
//
//  大事记提交已改走工单系统，此处查询本人的 timeline_submit 工单，
//  工单状态映射：open → pending，closed 时依 result 判定通过 / 拒绝。
// ------------------------------------------------------------

timelineRoutes.get("/my", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      401 as any
    );
  }

  // 拉取本人工单后过滤出大事记提交类型
  const tickets = await getMyTickets(c.env.DB, user.id, 100, 0);

  const items = tickets
    .filter((t) => t.type === "timeline_submit")
    .map((t) => {
      // 从 extraData 中还原 eventDate
      let eventDate = "";
      if (t.extraData) {
        try {
          const extra = JSON.parse(t.extraData) as Record<string, unknown>;
          eventDate = typeof extra.eventDate === "string" ? extra.eventDate : "";
        } catch {
          eventDate = "";
        }
      }

      // 工单状态 → 审核状态映射
      const status =
        t.status === "open"
          ? "pending"
          : t.result?.startsWith("已批准")
            ? "approved"
            : "rejected";

      return {
        id: t.id,
        title: t.title,
        status,
        eventDate,
        createdAt: t.createdAt,
        result: t.result,
      };
    });

  return c.json({ success: true, data: items });
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
//  POST /  — 提交大事记（创建 timeline_submit 工单）
//
//  审核统一走工单系统（POST /api/ticket/handle），
//  工单批准后由 createTimelineFromTicket 创建 approved 大事记。
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

  // 创建 timeline_submit 工单，eventDate 存入 extraData
  const id = await createTicket(c.env.DB, {
    type: "timeline_submit",
    title,
    content: description,
    submittedBy: user.id,
    extraData: { eventDate },
  });

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  GET /comments  — 大事记评论列表（顶级）
//
//  评论存于 post 表（parentId = timelineId），子回复仍走
//  GET /api/post/comments（父评论是 post 行）。
// ------------------------------------------------------------

timelineRoutes.get("/comments", async (c) => {
  const timelineId = c.req.query("timelineId");
  if (!timelineId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 timelineId 参数" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const user = c.get("user");

  // 大事记不存在 → 404（零信任）
  const exists = await c.env.DB
    .prepare("SELECT id FROM timeline_event WHERE id = ? AND status = 'approved'")
    .bind(timelineId)
    .first();
  if (!exists) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  const comments = await listPostsByParent(c.env.DB, timelineId, user, limit, offset);
  const enriched = await enrichPosts(c.env.DB, comments, user);

  return c.json({ success: true, data: enriched });
});

// ------------------------------------------------------------
//  POST /comment  — 发表大事记评论
// ------------------------------------------------------------

timelineRoutes.post("/comment", requirePermission(PERM_COMMENT), async (c) => {
  const user = c.get("user")!;

  // 频率限制：与帖子评论共用 comment 桶（每小时 20 条）
  const rate = checkRateLimit(user.id, "comment", 3600, 20);
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

  const timelineId = body.timelineId as string;
  const content = (body.content as string) ?? "";

  if (!timelineId) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少 timelineId" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!content) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "内容不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (content.length > LIMITS.COMMENT) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `评论最多 ${LIMITS.COMMENT} 字` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const id = await createTimelineComment(c.env.DB, timelineId, {
    authorId: user.id,
    content,
    authorVisible: (body.authorVisible as boolean) ?? true,
  });
  if (!id) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  // 通知大事记提交者
  const event = await c.env.DB
    .prepare("SELECT submittedBy FROM timeline_event WHERE id = ?")
    .bind(timelineId)
    .first<{ submittedBy: string }>();

  if (event && event.submittedBy !== user.id) {
    const profile = await c.env.DB
      .prepare("SELECT username FROM user_profile WHERE userId = ?")
      .bind(user.id)
      .first<{ username: string }>();

    await createNotification(c.env.DB, {
      userId: event.submittedBy,
      type: "comment",
      targetType: "timeline",
      targetId: timelineId,
      content: `${profile?.username ?? "用户"} 评论了你提交的大事记`,
    });
  }

  return c.json({ success: true, data: { id } });
});

export default timelineRoutes;
