/**
 * 搜索数据访问层
 *
 * 搜索范围：帖子、评论、用户、板块、大事记、表白墙
 * 排序：多级 rank（精确匹配 > 前缀 > 标题包含 > 内容包含），同 rank 按 createdAt 倒序
 * 权限：零信任模型，只返回当前用户有权看到的内容
 *
 * 安全规则：
 *   - 学号（studentId）永不返回
 *   - 表白墙 authorId 永不返回
 *   - 帖子需经过 visibility + block 权限过滤
 *   - 锁定板块仅成员和 manage_block 可见
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_MANAGE_BLOCK } from "../shared/permissions";

// ============================================================
//  返回类型
// ============================================================

/** 搜索结果中的帖子 */
export interface SearchPostResult {
  id: string;
  parentId: string | null;
  authorId: string | null;
  title: string | null;
  content: string;
  blockId: string | null;
  createdAt: string;
}

/** 搜索结果中的用户（不含学号） */
export interface SearchUserResult {
  userId: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
}

/** 搜索结果中的板块 */
export interface SearchBlockResult {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isLocked: boolean;
  createdAt: string;
}

/** 搜索结果中的大事记 */
export interface SearchTimelineResult {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  createdAt: string;
}

/** 搜索结果中的表白墙（不含 authorId） */
export interface SearchConfessionResult {
  id: string;
  content: string;
  createdAt: string;
}

/** 聚合搜索结果 */
export interface SearchAllResult {
  posts?: SearchPostResult[];
  comments?: SearchPostResult[];
  users?: SearchUserResult[];
  blocks?: SearchBlockResult[];
  timeline?: SearchTimelineResult[];
  confessions?: SearchConfessionResult[];
}

// ============================================================
//  辅助函数
// ============================================================

/**
 * 转义 LIKE 特殊字符（% 和 _）
 *
 * 防止用户输入的通配符影响搜索语义。
 */
function escapeLike(str: string): string {
  return str.replace(/[%_]/g, (m) => "\\" + m);
}

/** 检查用户是否可访问指定板块 */
async function canAccessBlock(
  db: D1Database,
  blockId: string | null,
  user: CurrentUser | null
): Promise<boolean> {
  if (!blockId) return true;
  if (can(user, PERM_MANAGE_BLOCK)) return true;
  if (!user) return false;

  const member = await db
    .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, user.id)
    .first();

  return !!member;
}

// ============================================================
//  帖子搜索
// ============================================================

/**
 * 搜索帖子（标题 + 内容）
 *
 * 权限过滤：visibility + block 访问
 * 排序：rank ASC, createdAt DESC
 */
export async function searchPosts(
  db: D1Database,
  q: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<SearchPostResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;
  const likePrefix = `${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT id, parentId, authorId, title, content, visibility, blockId, createdAt,
         CASE
           WHEN title = ? THEN 0
           WHEN title LIKE ? ESCAPE '\\' THEN 1
           WHEN title LIKE ? ESCAPE '\\' THEN 2
           ELSE 3
         END as rank
       FROM post
       WHERE (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
         AND isDeleted = 0 AND isArchived = 0
       ORDER BY rank ASC, createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(q, likePrefix, likeContains, likeContains, likeContains, limit + 50, offset)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      createdAt: string;
      rank: number;
    }>();

  // 权限过滤
  const results: SearchPostResult[] = [];
  for (const row of rows.results) {
    // visibility 检查
    if (row.visibility === "private") continue;
    if (row.visibility === "selected") {
      if (!user || user.id !== row.authorId) {
        const inList = await db
          .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
          .bind(row.id, user?.id ?? "")
          .first();
        if (!inList) continue;
      }
    }

    // block 访问检查
    if (!(await canAccessBlock(db, row.blockId, user))) continue;

    results.push({
      id: row.id,
      parentId: row.parentId,
      authorId: row.authorId,
      title: row.title,
      content: row.content,
      blockId: row.blockId,
      createdAt: row.createdAt,
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ============================================================
//  评论搜索
// ============================================================

/**
 * 搜索评论（内容）
 *
 * 只搜未删除且父帖可见的评论。
 */
export async function searchComments(
  db: D1Database,
  q: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<SearchPostResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT c.id, c.parentId, c.authorId, c.title, c.content, c.visibility, c.blockId, c.createdAt,
         CASE WHEN c.content LIKE ? ESCAPE '\\' THEN 3 ELSE 3 END as rank
       FROM post c
       WHERE c.content LIKE ? ESCAPE '\\'
         AND c.parentId IS NOT NULL
         AND c.isDeleted = 0 AND c.isArchived = 0
       ORDER BY c.createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(likeContains, likeContains, limit + 50, offset)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      createdAt: string;
      rank: number;
    }>();

  // 权限过滤：检查父帖可见性
  const results: SearchPostResult[] = [];
  for (const row of rows.results) {
    // 检查父帖是否存在且可见
    if (!row.parentId) continue;

    const parentPost = await db
      .prepare(
        "SELECT id, visibility, blockId, authorId, isDeleted FROM post WHERE id = ?"
      )
      .bind(row.parentId)
      .first<{ id: string; visibility: string; blockId: string | null; authorId: string; isDeleted: number }>();

    if (!parentPost || parentPost.isDeleted) continue;

    // 父帖 visibility 检查
    if (parentPost.visibility === "private") continue;
    if (parentPost.visibility === "selected") {
      if (!user || user.id !== parentPost.authorId) {
        const inList = await db
          .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
          .bind(parentPost.id, user?.id ?? "")
          .first();
        if (!inList) continue;
      }
    }

    // 父帖 block 访问检查
    if (!(await canAccessBlock(db, parentPost.blockId, user))) continue;

    results.push({
      id: row.id,
      parentId: row.parentId,
      authorId: row.authorId,
      title: row.title,
      content: row.content,
      blockId: row.blockId,
      createdAt: row.createdAt,
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ============================================================
//  用户搜索
// ============================================================

/**
 * 搜索用户（仅 username，不搜 studentId）
 *
 * 学号永不返回。
 */
export async function searchUsers(
  db: D1Database,
  q: string,
  limit: number,
  offset: number
): Promise<SearchUserResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;
  const likePrefix = `${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT userId, username, nameColor, badge,
         CASE
           WHEN username = ? THEN 0
           WHEN username LIKE ? ESCAPE '\\' THEN 1
           ELSE 2
         END as rank
       FROM user_profile
       WHERE username LIKE ? ESCAPE '\\'
       ORDER BY rank ASC, createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(q, likePrefix, likeContains, limit, offset)
    .all<{
      userId: string;
      username: string;
      nameColor: string | null;
      badge: string | null;
      rank: number;
    }>();

  return rows.results.map((row) => ({
    userId: row.userId,
    username: row.username,
    nameColor: row.nameColor,
    badge: row.badge,
  }));
}

// ============================================================
//  板块搜索
// ============================================================

/**
 * 搜索板块（名称 + 描述）
 *
 * 只搜 isDeleted = 0 的板块。
 * 锁定板块仅成员和 manage_block 可见。
 */
export async function searchBlocks(
  db: D1Database,
  q: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<SearchBlockResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;
  const likePrefix = `${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT id, name, description, ownerId, isLocked, createdAt,
         CASE
           WHEN name = ? THEN 0
           WHEN name LIKE ? ESCAPE '\\' THEN 1
           WHEN name LIKE ? ESCAPE '\\' THEN 2
           ELSE 3
         END as rank
       FROM block
       WHERE (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
         AND isDeleted = 0
       ORDER BY rank ASC, createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(q, likePrefix, likeContains, likeContains, likeContains, limit + 20, offset)
    .all<{
      id: string;
      name: string;
      description: string | null;
      ownerId: string;
      isLocked: number;
      createdAt: string;
      rank: number;
    }>();

  // 权限过滤：锁定板块仅成员和 manage_block 可见
  const results: SearchBlockResult[] = [];
  for (const row of rows.results) {
    if (row.isLocked) {
      if (!can(user, PERM_MANAGE_BLOCK)) {
        if (!user) continue;
        const member = await db
          .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ?")
          .bind(row.id, user.id)
          .first();
        if (!member) continue;
      }
    }

    results.push({
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      isLocked: !!row.isLocked,
      createdAt: row.createdAt,
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ============================================================
//  大事记搜索
// ============================================================

/**
 * 搜索大事记（标题 + 描述）
 *
 * 只搜 status = 'approved'。
 */
export async function searchTimeline(
  db: D1Database,
  q: string,
  limit: number,
  offset: number
): Promise<SearchTimelineResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;
  const likePrefix = `${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT id, title, description, eventDate, createdAt,
         CASE
           WHEN title = ? THEN 0
           WHEN title LIKE ? ESCAPE '\\' THEN 1
           WHEN title LIKE ? ESCAPE '\\' THEN 2
           ELSE 3
         END as rank
       FROM timeline_event
       WHERE (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
         AND status = 'approved' AND isArchived = 0
       ORDER BY rank ASC, eventDate DESC
       LIMIT ? OFFSET ?`
    )
    .bind(q, likePrefix, likeContains, likeContains, likeContains, limit, offset)
    .all<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      createdAt: string;
      rank: number;
    }>();

  return rows.results.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    eventDate: row.eventDate,
    createdAt: row.createdAt,
  }));
}

// ============================================================
//  表白墙搜索
// ============================================================

/**
 * 搜索表白墙（内容）
 *
 * authorId 永不返回。
 */
export async function searchConfessions(
  db: D1Database,
  q: string,
  limit: number,
  offset: number
): Promise<SearchConfessionResult[]> {
  const escaped = escapeLike(q);
  const likeContains = `%${escaped}%`;

  const rows = await db
    .prepare(
      `SELECT id, content, createdAt
       FROM confession
       WHERE content LIKE ? ESCAPE '\\'
         AND isDeleted = 0 AND isArchived = 0
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(likeContains, limit, offset)
    .all<{
      id: string;
      content: string;
      createdAt: string;
    }>();

  return rows.results.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
  }));
}

// ============================================================
//  聚合搜索
// ============================================================

/**
 * 搜索所有类型
 *
 * 对每种类型分别搜索，聚合返回。
 */
export async function searchAll(
  db: D1Database,
  q: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<SearchAllResult> {
  const [posts, comments, users, blocks, timeline, confessions] = await Promise.all([
    searchPosts(db, q, user, limit, offset),
    searchComments(db, q, user, limit, offset),
    searchUsers(db, q, limit, offset),
    searchBlocks(db, q, user, limit, offset),
    searchTimeline(db, q, limit, offset),
    searchConfessions(db, q, limit, offset),
  ]);

  return { posts, comments, users, blocks, timeline, confessions };
}

