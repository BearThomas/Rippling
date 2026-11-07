/**
 * 搜索数据访问层
 *
 * 搜索范围：帖子、评论、用户、板块、大事记、表白墙
 * 排序：多级 rank（精确匹配 > 前缀 > 标题包含 > 内容包含），同 rank 按 createdAt 倒序
 * 权限：零信任模型，只返回当前用户有权看到的内容
 *
 * 安全规则：
 *   - 学号（studentId）永不返回
 *   - 匿名帖 / 匿名评论不返回 authorId（除非有 view_anonymous_identity 权限）
 *   - 表白墙 authorId 永不返回
 *   - 帖子需经过 visibility + block 权限过滤（private = 仅自己）
 *   - 锁定板块仅成员和 manage_block 可见
 *
 * 分页：offset / limit 作用在**可见结果**上。SQL 只按扫描上限取候选，权限过滤后再切片。
 * 若让 SQL 先 LIMIT/OFFSET 再过滤，被过滤掉的行会占掉分页名额，第 2 页会重复第 1 页
 * （"加载更多"点了没反应就是这个原因）。候选上限见 SCAN_LIMIT。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_MANAGE_BLOCK, PERM_VIEW_ANONYMOUS_IDENTITY } from "../shared/permissions";
import { computeNameColor, loadNameColors } from "../utils/userLevel";

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
  /** 头像 URL（user 表 image 字段，无头像为 null） */
  avatar: string | null;
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

/** 单次搜索最多扫描的候选行数（权限过滤在内存里做，必须先有一个上限） */
const SCAN_LIMIT = 500;

// ============================================================
//  辅助函数
// ============================================================

/**
 * 转义 LIKE 特殊字符（% 和 _）
 *
 * 防止用户输入的通配符影响搜索语义。
 */
function escapeLike(str: string): string {
  // 反斜杠本身是 ESCAPE 字符，必须一起转义，否则 "a\b" 这类关键词会把后一个字符吃掉
  return str.replace(/[\\%_]/g, (m) => "\\" + m);
}

/** 有权查看匿名帖真实作者吗 */
function hasAnonView(user: CurrentUser | null): boolean {
  return can(user, PERM_VIEW_ANONYMOUS_IDENTITY);
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
/** 帖子行的可见性判断（private 仅作者、selected 仅作者与白名单） */
async function canSeeVisibility(
  db: D1Database,
  row: { id: string; authorId: string; visibility: string },
  user: CurrentUser | null
): Promise<boolean> {
  if (row.visibility === "private") {
    // 创建页写的是"仅自己"：那就只有作者能搜到
    return !!user && user.id === row.authorId;
  }
  if (row.visibility === "selected") {
    if (user?.id === row.authorId) return true;
    if (!user) return false;
    const inList = await db
      .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
      .bind(row.id, user.id)
      .first();
    return !!inList;
  }
  return true;
}

/** 帖子整体可见性：可见性 + 板块访问权 */
async function canSeePostRow(
  db: D1Database,
  row: { id: string; authorId: string; visibility: string; blockId: string | null },
  user: CurrentUser | null
): Promise<boolean> {
  if (!(await canSeeVisibility(db, row, user))) return false;
  return canAccessBlock(db, row.blockId, user);
}

/**
 * 搜索帖子（标题 + 内容）
 *
 * 只搜顶级帖（parentId IS NULL）—— 评论在"评论"结果里，不该在"帖子"里冒充帖子。
 * 权限过滤：visibility + block 访问 + 匿名作者（authorVisible = 0 不返回 authorId）
 * 排序：rank ASC, createdAt DESC
 *
 * 分页：权限过滤必须在 SQL 之后做（板块成员、白名单要额外查询），
 * 所以 SQL 只取扫描上限，切片在可见结果上做。否则被过滤掉的行会占分页名额，
 * 第 2 页会重复第 1 页 —— 表现就是"加载更多"点了没反应。
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
      `SELECT id, parentId, authorId, authorVisible, title, content, visibility, blockId, createdAt,
         CASE
           WHEN title = ? THEN 0
           WHEN title LIKE ? ESCAPE '\\' THEN 1
           WHEN title LIKE ? ESCAPE '\\' THEN 2
           ELSE 3
         END as rank
       FROM post
       WHERE (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
         AND parentId IS NULL
         AND isDeleted = 0 AND isArchived = 0
       ORDER BY rank ASC, createdAt DESC
       LIMIT ?`
    )
    .bind(q, likePrefix, likeContains, likeContains, likeContains, SCAN_LIMIT)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      authorVisible: number;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      createdAt: string;
      rank: number;
    }>();

  const visible: SearchPostResult[] = [];
  for (const row of rows.results) {
    if (!(await canSeePostRow(db, row, user))) continue;

    visible.push({
      id: row.id,
      parentId: row.parentId,
      // 匿名帖不返回真实作者 id（与推荐流的处理保持一致）
      authorId: row.authorVisible === 1 || hasAnonView(user) ? row.authorId : null,
      title: row.title,
      content: row.content,
      blockId: row.blockId,
      createdAt: row.createdAt,
    });
  }

  return visible.slice(offset, offset + limit);
}

// ============================================================
//  评论搜索
// ============================================================

/**
 * 搜索评论（内容）
 *
 * 只搜未删除且父帖可见的评论。
 */
/**
 * 搜索评论（内容）
 *
 * 只搜未删除的评论，且父帖必须存在、可见（父帖的可见性/板块/删除状态都要看）。
 * 匿名评论（authorVisible = 0）不返回 authorId。
 * 分页同帖子搜索：扫描上限 + 在可见结果上切片。
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
      `SELECT c.id, c.parentId, c.authorId, c.authorVisible, c.content, c.blockId, c.createdAt
       FROM post c
       WHERE c.content LIKE ? ESCAPE '\\'
         AND c.parentId IS NOT NULL
         AND c.isDeleted = 0 AND c.isArchived = 0
       ORDER BY c.createdAt DESC
       LIMIT ?`
    )
    .bind(likeContains, SCAN_LIMIT)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      authorVisible: number;
      content: string;
      blockId: string | null;
      createdAt: string;
    }>();

  const visible: SearchPostResult[] = [];
  for (const row of rows.results) {
    if (!row.parentId) continue;

    // 父帖必须还在、且当前用户看得到
    const parent = await db
      .prepare(
        "SELECT id, authorId, visibility, blockId FROM post WHERE id = ? AND isDeleted = 0 AND isArchived = 0"
      )
      .bind(row.parentId)
      .first<{
        id: string;
        authorId: string;
        visibility: string;
        blockId: string | null;
      }>();

    if (!parent) continue;
    if (!(await canSeePostRow(db, parent, user))) continue;

    visible.push({
      id: row.id,
      parentId: row.parentId,
      authorId: row.authorVisible === 1 || hasAnonView(user) ? row.authorId : null,
      // 评论没有标题
      title: null,
      content: row.content,
      blockId: row.blockId,
      createdAt: row.createdAt,
    });
  }

  return visible.slice(offset, offset + limit);
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

  // 头像存于 Better Auth 的 user 表 image 字段，左连接一并查出；
  // permissions 用于按等级计算 nameColor
  const nameColors = await loadNameColors(db);
  const rows = await db
    .prepare(
      `SELECT p.userId, p.username, p.permissions, p.badge, u.image AS avatar,
         CASE
           WHEN p.username = ? THEN 0
           WHEN p.username LIKE ? ESCAPE '\\' THEN 1
           ELSE 2
         END as rank
       FROM user_profile p
       LEFT JOIN user u ON u.id = p.userId
       WHERE p.username LIKE ? ESCAPE '\\'
       ORDER BY rank ASC, p.createdAt DESC
       LIMIT ? OFFSET ?`
    )
    .bind(q, likePrefix, likeContains, limit, offset)
    .all<{
      userId: string;
      username: string;
      permissions: number;
      badge: string | null;
      avatar: string | null;
      rank: number;
    }>();

  return rows.results.map((row) => ({
    userId: row.userId,
    username: row.username,
    // nameColor 不再取 user_profile.nameColor，按用户等级动态计算
    nameColor: computeNameColor(BigInt(row.permissions), nameColors),
    badge: row.badge,
    avatar: row.avatar,
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
       LIMIT ?`
    )
    .bind(q, likePrefix, likeContains, likeContains, likeContains, SCAN_LIMIT)
    .all<{
      id: string;
      name: string;
      description: string | null;
      ownerId: string;
      isLocked: number;
      createdAt: string;
      rank: number;
    }>();

  // 权限过滤（锁定板块仅成员和 manage_block 可见）+ 在可见结果上切片，
  // 和帖子搜索一样：不能把 OFFSET 下推给 SQL，否则分页会重复
  const visible: SearchBlockResult[] = [];
  for (const row of rows.results) {
    if (row.isLocked && !can(user, PERM_MANAGE_BLOCK)) {
      if (!user) continue;
      const member = await db
        .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ?")
        .bind(row.id, user.id)
        .first();
      if (!member) continue;
    }

    visible.push({
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      isLocked: !!row.isLocked,
      createdAt: row.createdAt,
    });
  }

  return visible.slice(offset, offset + limit);
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

