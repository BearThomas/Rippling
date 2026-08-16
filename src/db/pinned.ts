/**
 * 置顶管理数据访问层
 *
 * 底层表：pinned_item
 * 规则：
 *   - 仅 pin_post 权限用户可置顶 / 取消置顶
 *   - 可置顶类型：post / timeline / vote（表白墙不可置顶）
 *   - 支持期限（expiresAt）或永久（expiresAt = null）
 *   - 推荐流第一页返回置顶内容
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_PIN_POST, PERM_MANAGE_BLOCK } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 可置顶的内容类型 */
const PINNABLE_TYPES = ["post", "timeline", "vote"] as const;

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

// ============================================================
//  查询函数
// ============================================================

/**
 * 置顶内容
 *
 * 需要 pin_post 权限，targetType 仅限 post / timeline / vote。
 * 使用 UNIQUE 约束防止重复置顶。
 *
 * @returns false 表示无权限、类型不允许或已置顶
 */
export async function pinItem(
  db: D1Database,
  targetType: string,
  targetId: string,
  expiresAt: string | null,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_PIN_POST)) return false;
  if (!user) return false;

  // 类型检查：表白墙不可置顶
  if (!PINNABLE_TYPES.includes(targetType as typeof PINNABLE_TYPES[number])) {
    return false;
  }

  const id = generateUUID();
  const now = nowISO();

  try {
    await db
      .prepare(
        `INSERT INTO pinned_item (id, targetType, targetId, createdBy, expiresAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, targetType, targetId, user.id, expiresAt, now)
      .run();
  } catch {
    // UNIQUE 约束冲突（已置顶）
    return false;
  }

  return true;
}

/**
 * 取消置顶
 *
 * 需要 pin_post 权限。
 *
 * @returns false 表示无权限或置顶项不存在
 */
export async function unpinItem(
  db: D1Database,
  targetType: string,
  targetId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_PIN_POST)) return false;
  if (!user) return false;

  const result = await db
    .prepare("DELETE FROM pinned_item WHERE targetType = ? AND targetId = ?")
    .bind(targetType, targetId)
    .run();

  return result.meta.changes > 0;
}

/**
 * 列出当前有效的置顶项（未过期）
 *
 * 对每个置顶项，根据 targetType 从对应表加载数据。
 * 应用权限过滤：无权限的内容不返回。
 *
 * @returns 有效置顶项列表（含关联数据）
 */
export async function listActivePinned(
  db: D1Database,
  user: CurrentUser | null
): Promise<PinnedItemInfo[]> {
  const now = nowISO();

  // 查询未过期的置顶项
  const rows = await db
    .prepare(
      `SELECT id, targetType, targetId, createdBy, expiresAt, createdAt
       FROM pinned_item
       WHERE expiresAt IS NULL OR expiresAt > ?
       ORDER BY createdAt DESC`
    )
    .bind(now)
    .all<{
      id: string;
      targetType: string;
      targetId: string;
      createdBy: string;
      expiresAt: string | null;
      createdAt: string;
    }>();

  const results: PinnedItemInfo[] = [];

  for (const row of rows.results) {
    let data: Record<string, unknown> | null = null;

    switch (row.targetType) {
      case "post":
        data = await loadPostForPinned(db, row.targetId, user);
        break;
      case "timeline":
        data = await loadTimelineForPinned(db, row.targetId);
        break;
      case "vote":
        data = await loadVoteForPinned(db, row.targetId);
        break;
      default:
        continue;
    }

    // 无权限的内容跳过
    if (!data) continue;

    results.push({
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      createdBy: row.createdBy,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      data,
    });
  }

  return results;
}

// ============================================================
//  内部辅助：加载关联数据
// ============================================================

/** 加载帖子数据（含权限过滤） */
async function loadPostForPinned(
  db: D1Database,
  postId: string,
  user: CurrentUser | null
): Promise<Record<string, unknown> | null> {
  const post = await db
    .prepare(
      `SELECT id, authorId, title, content, visibility, blockId, createdAt
       FROM post WHERE id = ? AND isDeleted = 0 AND isArchived = 0 AND parentId IS NULL`
    )
    .bind(postId)
    .first<{
      id: string;
      authorId: string;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      createdAt: string;
    }>();

  if (!post) return null;

  // visibility 检查
  if (post.visibility === "private") return null;
  if (post.visibility === "selected") {
    if (!user || user.id !== post.authorId) {
      const inList = await db
        .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
        .bind(post.id, user?.id ?? "")
        .first();
      if (!inList) return null;
    }
  }

  // 板块检查
  if (post.blockId) {
    const canAccess = await checkBlockAccess(db, post.blockId, user);
    if (!canAccess) return null;
  }

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
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
