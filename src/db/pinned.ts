/**
 * 置顶数据访问层
 *
 * 置顶分两种，各自只有一个真相（不要两边都写，写两份必然漂移）：
 *
 *   1. 帖子置顶 —— `post.isPinned` 列
 *      · 写入口只有一个：POST /api/post/pin（切换语义，返回置顶后的状态）
 *      · 生效位置：首页置顶区（本文件 listActivePinned）+ 板块帖子流排序
 *      · 无期限（列上没有 expiresAt），取消置顶 / 删除 / 归档后自然消失
 *
 *   2. 大事记 / 投票置顶 —— `pinned_item` 表
 *      · 写入口：POST /api/recommend/pin，DELETE /api/recommend/pin
 *      · 生效位置：首页置顶区
 *      · 支持期限（expiresAt = null 表示永久）
 *
 * 历史数据：早期版本会把帖子也写进 pinned_item。读取时仍然兼容
 * （见 listActivePinned 第二部分），但新写入会拒绝 targetType = "post"
 * 并提示改用 /api/post/pin，避免同一件事有两个写入口。
 *
 * 权限：置顶 / 取消置顶需要 pin_post（帖子另按板块权限判定，见 db/post.ts）；
 * 读取时逐项做可见性过滤，看不到的内容不返回。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_PIN_POST, PERM_MANAGE_BLOCK } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import {
  getPostAuthorBrief,
  getTargetLikeCount,
  getChildCommentCount,
} from "./enrichment";

// ============================================================
//  常量与返回类型
// ============================================================

/** 可以写入 pinned_item 的内容类型（帖子有自己的 isPinned 列，不在此列） */
const WRITABLE_TYPES = ["timeline", "vote"] as const;

/** 读取时认得的内容类型（post 仅用于兼容历史数据） */
const READABLE_TYPES = ["post", "timeline", "vote"] as const;

/** 首页置顶区最多返回的条数（防止一次置顶一堆把首页顶穿） */
const PINNED_LIMIT = 30;

/** 置顶项信息 */
export interface PinnedItemInfo {
  id: string;
  targetType: string;
  targetId: string;
  createdBy: string;
  expiresAt: string | null;
  createdAt: string;
  /** 关联的实际内容数据（根据 targetType 从对应表加载） */
  data: Record<string, unknown> | null;
}

/** 置顶写入结果 */
export type PinWriteResult =
  | { ok: true }
  /**
   * forbidden      —— 没有 pin_post 权限
   * invalid_type   —— 该类型不可置顶（含 targetType = "post"）
   * invalid_target —— 目标不存在 / 不可见 / 未通过审核
   * expired        —— expiresAt 不是有效时间或已经过去
   * already_pinned —— 已经置顶过
   * error          —— 数据库写入失败（不再静默当成"已置顶"）
   */
  | {
      ok: false;
      reason:
        | "forbidden"
        | "invalid_type"
        | "invalid_target"
        | "expired"
        | "already_pinned"
        | "error";
    };

/** 取消置顶结果 */
export type UnpinResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "not_pinned" | "error" };

// ============================================================
//  写入
// ============================================================

/**
 * 置顶一条大事记 / 投票
 *
 * 先校验目标真实存在且可见，再写库：
 * 跳过校验的话，接口会对一个不存在的 id 返回成功，
 * 而首页永远看不到它 —— 那种"成功但什么都没发生"最难查。
 */
export async function pinItem(
  db: D1Database,
  targetType: string,
  targetId: string,
  expiresAt: string | null,
  user: CurrentUser | null
): Promise<PinWriteResult> {
  if (!user || !can(user, PERM_PIN_POST)) {
    return { ok: false, reason: "forbidden" };
  }

  if (!WRITABLE_TYPES.includes(targetType as (typeof WRITABLE_TYPES)[number])) {
    return { ok: false, reason: "invalid_type" };
  }

  // 期限校验：必须能解析、且在未来
  let expires: string | null = null;
  if (expiresAt !== null) {
    const ts = Date.parse(expiresAt);
    if (Number.isNaN(ts)) return { ok: false, reason: "expired" };
    if (ts <= Date.now()) return { ok: false, reason: "expired" };
    expires = new Date(ts).toISOString();
  }

  // 目标校验（与读取时的过滤条件保持一致，否则置顶成功也显示不出来）
  const exists =
    targetType === "timeline"
      ? await db
          .prepare(
            "SELECT id FROM timeline_event WHERE id = ? AND status = 'approved' AND isArchived = 0"
          )
          .bind(targetId)
          .first()
      : await db
          .prepare("SELECT id FROM vote WHERE id = ?")
          .bind(targetId)
          .first();

  if (!exists) return { ok: false, reason: "invalid_target" };

  const existing = await db
    .prepare("SELECT id FROM pinned_item WHERE targetType = ? AND targetId = ?")
    .bind(targetType, targetId)
    .first();

  if (existing) return { ok: false, reason: "already_pinned" };

  try {
    await db
      .prepare(
        `INSERT INTO pinned_item (id, targetType, targetId, createdBy, expiresAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(generateUUID(), targetType, targetId, user.id, expires, nowISO())
      .run();
  } catch (error) {
    console.error("[pinned] 写入置顶失败:", error);
    return { ok: false, reason: "error" };
  }

  return { ok: true };
}

/**
 * 取消置顶一条大事记 / 投票
 *
 * 帖子不走这里：帖子的置顶状态在 post.isPinned（见 db/post.ts 的 pinPost）。
 */
export async function unpinItem(
  db: D1Database,
  targetType: string,
  targetId: string,
  user: CurrentUser | null
): Promise<UnpinResult> {
  if (!user || !can(user, PERM_PIN_POST)) {
    return { ok: false, reason: "forbidden" };
  }

  if (targetType === "post") {
    // 历史数据里可能还留着帖子置顶行：删掉它，并清掉 isPinned，
    // 否则两处状态会互相打架（列表里有、按钮却是"未置顶"）。
    try {
      const removed = await db
        .prepare("DELETE FROM pinned_item WHERE targetType = 'post' AND targetId = ?")
        .bind(targetId)
        .run();
      const flagged = await db
        .prepare("UPDATE post SET isPinned = 0 WHERE id = ? AND isPinned = 1")
        .bind(targetId)
        .run();
      if ((removed.meta.changes ?? 0) === 0 && (flagged.meta.changes ?? 0) === 0) {
        return { ok: false, reason: "not_pinned" };
      }
      return { ok: true };
    } catch (error) {
      console.error("[pinned] 取消帖子置顶失败:", error);
      return { ok: false, reason: "error" };
    }
  }

  try {
    const result = await db
      .prepare("DELETE FROM pinned_item WHERE targetType = ? AND targetId = ?")
      .bind(targetType, targetId)
      .run();

    if ((result.meta.changes ?? 0) === 0) return { ok: false, reason: "not_pinned" };
    return { ok: true };
  } catch (error) {
    console.error("[pinned] 取消置顶失败:", error);
    return { ok: false, reason: "error" };
  }
}

// ============================================================
//  读取
// ============================================================

/** 置顶引用（只含类型与 id，用于把置顶项从推荐流里剔除） */
export interface PinnedRef {
  targetType: string;
  targetId: string;
}

/**
 * 列出所有置顶项的类型与 id
 *
 * 推荐流每一页都要用它剔除置顶内容（否则第一页剔、第二页不剔，游标会错位），
 * 但不该为此付出"逐条加载作者 / 点赞 / 评论"的代价，所以单独留一个便宜版本。
 * 这里故意不做可见性过滤：看不到的置顶项本来也不会出现在他的推荐流里。
 */
export async function listPinnedRefs(db: D1Database): Promise<PinnedRef[]> {
  const [postRows, itemRows] = await Promise.all([
    db
      .prepare(
        `SELECT id FROM post
         WHERE isPinned = 1 AND parentId IS NULL AND isDeleted = 0 AND isArchived = 0`
      )
      .all<{ id: string }>(),
    db
      .prepare(
        `SELECT targetType, targetId FROM pinned_item
         WHERE expiresAt IS NULL OR expiresAt > ?`
      )
      .bind(nowISO())
      .all<{ targetType: string; targetId: string }>(),
  ]);

  const seen = new Set<string>();
  const refs: PinnedRef[] = [];

  for (const row of postRows.results) {
    const key = `post:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ targetType: "post", targetId: row.id });
  }

  for (const row of itemRows.results) {
    const key = `${row.targetType}:${row.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ targetType: row.targetType, targetId: row.targetId });
  }

  return refs;
}

/**
 * 列出当前有效的置顶项（首页置顶区）
 *
 * 顺序：帖子置顶（按发布时间倒序）→ 大事记 / 投票置顶（按置顶时间倒序）。
 * 每一项都做可见性过滤：无权限、已删除、已归档、未通过审核的都不返回。
 */
export async function listActivePinned(
  db: D1Database,
  user: CurrentUser | null
): Promise<PinnedItemInfo[]> {
  const results: PinnedItemInfo[] = [];
  const seen = new Set<string>();

  /** 去重压入：同一（类型, id）只出现一次 */
  function push(item: PinnedItemInfo): void {
    const key = `${item.targetType}:${item.targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  }

  // ---------------- 1) 帖子：post.isPinned ----------------

  const postRows = await db
    .prepare(
      `SELECT id, authorId, authorVisible, title, content, visibility, blockId, createdAt
       FROM post
       WHERE isPinned = 1 AND parentId IS NULL AND isDeleted = 0 AND isArchived = 0
       ORDER BY createdAt DESC
       LIMIT ?`
    )
    .bind(PINNED_LIMIT)
    .all<PostRow>();

  for (const row of postRows.results) {
    const data = await buildPinnedPostData(db, row, user);
    if (!data) continue;
    push({
      // 帖子没有置顶行 id，用合成 id 保证前端 key 唯一
      id: `post:${row.id}`,
      targetType: "post",
      targetId: row.id,
      createdBy: row.authorId,
      expiresAt: null,
      createdAt: row.createdAt,
      data,
    });
  }

  // ---------------- 2) pinned_item（大事记 / 投票 + 历史帖子行） ----------------

  const rows = await db
    .prepare(
      `SELECT id, targetType, targetId, createdBy, expiresAt, createdAt
       FROM pinned_item
       WHERE expiresAt IS NULL OR expiresAt > ?
       ORDER BY createdAt DESC
       LIMIT ?`
    )
    .bind(nowISO(), PINNED_LIMIT)
    .all<{
      id: string;
      targetType: string;
      targetId: string;
      createdBy: string;
      expiresAt: string | null;
      createdAt: string;
    }>();

  for (const row of rows.results) {
    if (!READABLE_TYPES.includes(row.targetType as (typeof READABLE_TYPES)[number])) {
      continue;
    }

    // 已经在第 1 部分出现过的帖子，不要重复展示
    if (seen.has(`${row.targetType}:${row.targetId}`)) continue;

    let data: Record<string, unknown> | null = null;
    if (row.targetType === "post") {
      data = await loadPostForPinned(db, row.targetId, user);
    } else if (row.targetType === "timeline") {
      data = await loadTimelineForPinned(db, row.targetId);
    } else {
      data = await loadVoteForPinned(db, row.targetId);
    }

    if (!data) continue;
    push({ ...row, data });
  }

  return results;
}

// ============================================================
//  内部辅助：加载关联数据
// ============================================================

/** 数据库里的帖子行（置顶相关字段） */
interface PostRow {
  id: string;
  authorId: string;
  authorVisible: number;
  title: string | null;
  content: string;
  visibility: string;
  blockId: string | null;
  createdAt: string;
}

/** 加载帖子数据（含权限过滤 + 展示信息附加） */
async function loadPostForPinned(
  db: D1Database,
  postId: string,
  user: CurrentUser | null
): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(
      `SELECT id, authorId, authorVisible, title, content, visibility, blockId, createdAt
       FROM post WHERE id = ? AND isDeleted = 0 AND isArchived = 0 AND parentId IS NULL`
    )
    .bind(postId)
    .first<PostRow>();

  if (!row) return null;
  return buildPinnedPostData(db, row, user);
}

/** 对已取到的帖子行做可见性检查 + 附加展示信息 */
async function buildPinnedPostData(
  db: D1Database,
  row: PostRow,
  user: CurrentUser | null
): Promise<Record<string, unknown> | null> {
  // private：任何人都不可见（作者自己也不该在公开置顶区看到）
  if (row.visibility === "private") return null;

  // selected：仅作者与白名单成员可见
  if (row.visibility === "selected" && (!user || user.id !== row.authorId)) {
    const inList = await db
      .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
      .bind(row.id, user?.id ?? "")
      .first();
    if (!inList) return null;
  }

  // 板块帖：需要板块访问权
  if (row.blockId && !(await checkBlockAccess(db, row.blockId, user))) return null;

  const [author, likeCount, commentCount] = await Promise.all([
    getPostAuthorBrief(db, row.authorId, row.authorVisible === 1, user),
    getTargetLikeCount(db, "post", row.id),
    getChildCommentCount(db, row.id),
  ]);

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    author,
    authorVisible: row.authorVisible === 1,
    isPinned: true,
    likeCount,
    commentCount,
    createdAt: row.createdAt,
  };
}

/** 加载大事记数据 */
async function loadTimelineForPinned(
  db: D1Database,
  timelineId: string
): Promise<Record<string, unknown> | null> {
  const event = await db
    .prepare(
      `SELECT id, title, description, eventDate, createdAt
       FROM timeline_event WHERE id = ? AND status = 'approved' AND isArchived = 0`
    )
    .bind(timelineId)
    .first<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      createdAt: string;
    }>();

  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventDate: event.eventDate,
    createdAt: event.createdAt,
  };
}

/** 加载投票数据 */
async function loadVoteForPinned(
  db: D1Database,
  voteId: string
): Promise<Record<string, unknown> | null> {
  const vote = await db
    .prepare(
      `SELECT id, title, description, endAt, isClosed, createdAt FROM vote WHERE id = ?`
    )
    .bind(voteId)
    .first<{
      id: string;
      title: string;
      description: string | null;
      endAt: string;
      isClosed: number;
      createdAt: string;
    }>();

  if (!vote) return null;

  return {
    id: vote.id,
    title: vote.title,
    description: vote.description,
    endAt: vote.endAt,
    isClosed: !!vote.isClosed,
    createdAt: vote.createdAt,
  };
}

/** 检查用户是否可访问指定板块 */
async function checkBlockAccess(
  db: D1Database,
  blockId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;
  if (can(user, PERM_MANAGE_BLOCK)) return true;

  const member = await db
    .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, user.id)
    .first();

  return !!member;
}
