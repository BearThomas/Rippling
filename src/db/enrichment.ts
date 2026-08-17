/**
 * 帖子 / 评论展示信息附加层（enrichment）
 *
 * DAL 核心（post.ts）只返回基础字段；路由层展示时需要：
 *   - author：作者用户名 / 颜色 / 徽章（匿名时为 null）
 *   - likeCount：点赞数
 *   - commentCount：子评论数（仅顶级帖有意义）
 *   - liked：当前用户是否已点赞
 *
 * 全部使用批量查询，避免 N+1。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_VIEW_ANONYMOUS_IDENTITY } from "../shared/permissions";
import type { PostInfo } from "./post";

// ============================================================
//  返回类型
// ============================================================

/** 作者展示摘要 */
export interface PostAuthorBrief {
  id: string;
  username: string;
  nameColor: string | null;
  badge: string | null;
}

/** 附加展示信息后的帖子 / 评论 */
export interface EnrichedPost extends PostInfo {
  /** 作者信息（匿名时为 null） */
  author: PostAuthorBrief | null;
  likeCount: number;
  commentCount: number;
  /** 当前用户是否已点赞（游客为 false） */
  liked: boolean;
}

// ============================================================
//  批量查询辅助
// ============================================================

/** 分批执行 IN 查询（SQLite 参数上限保护） */
const BATCH_SIZE = 50;

function chunk<T>(list: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    result.push(list.slice(i, i + size));
  }
  return result;
}

/** 批量查询作者资料（username / nameColor / badge） */
async function batchGetAuthors(
  db: D1Database,
  authorIds: string[]
): Promise<Map<string, PostAuthorBrief>> {
  const map = new Map<string, PostAuthorBrief>();
  const unique = [...new Set(authorIds)];

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT userId, username, nameColor, badge
         FROM user_profile WHERE userId IN (${placeholders})`
      )
      .bind(...batch)
      .all<{
        userId: string;
        username: string;
        nameColor: string | null;
        badge: string | null;
      }>();

    for (const row of rows.results) {
      map.set(row.userId, {
        id: row.userId,
        username: row.username,
        nameColor: row.nameColor,
        badge: row.badge,
      });
    }
  }

  return map;
}

/** 批量查询点赞数（targetType 固定） */
async function batchGetTargetLikeCounts(
  db: D1Database,
  targetType: string,
  targetIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const batch of chunk(targetIds, BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT targetId, COUNT(*) as count FROM likes
         WHERE targetType = ? AND targetId IN (${placeholders})
         GROUP BY targetId`
      )
      .bind(targetType, ...batch)
      .all<{ targetId: string; count: number }>();

    for (const row of rows.results) {
      map.set(row.targetId, row.count);
    }
  }

  return map;
}

/** 批量查询当前用户已点赞的目标 ID 集合 */
async function batchGetLikedIds(
  db: D1Database,
  targetType: string,
  targetIds: string[],
  userId: string | null
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!userId || !targetIds.length) return set;

  for (const batch of chunk(targetIds, BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT targetId FROM likes
         WHERE targetType = ? AND userId = ? AND targetId IN (${placeholders})`
      )
      .bind(targetType, userId, ...batch)
      .all<{ targetId: string }>();

    for (const row of rows.results) {
      set.add(row.targetId);
    }
  }

  return set;
}

/** 批量查询子评论数（帖子 ID -> 评论数） */
async function batchGetChildCounts(
  db: D1Database,
  postIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const batch of chunk(postIds, BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT parentId, COUNT(*) as count FROM post
         WHERE parentId IN (${placeholders}) AND isDeleted = 0
         GROUP BY parentId`
      )
      .bind(...batch)
      .all<{ parentId: string; count: number }>();

    for (const row of rows.results) {
      map.set(row.parentId, row.count);
    }
  }

  return map;
}

// ============================================================
//  对外函数
// ============================================================

/**
 * 批量附加展示信息（作者 / 点赞数 / 评论数 / 是否已赞）
 *
 * 匿名规则：authorId 为 null（对当前用户隐藏身份）→ author 为 null。
 */
export async function enrichPosts(
  db: D1Database,
  posts: PostInfo[],
  user: CurrentUser | null
): Promise<EnrichedPost[]> {
  if (!posts.length) return [];

  const authorIds = posts
    .map((p) => p.authorId)
    .filter((id): id is string => !!id);
  const postIds = posts.map((p) => p.id);

  const [authors, likeCounts, childCounts, likedIds] = await Promise.all([
    batchGetAuthors(db, authorIds),
    batchGetTargetLikeCounts(db, "post", postIds),
    batchGetChildCounts(db, postIds),
    batchGetLikedIds(db, "post", postIds, user?.id ?? null),
  ]);

  return posts.map((post) => ({
    ...post,
    author: post.authorId ? authors.get(post.authorId) ?? null : null,
    likeCount: likeCounts.get(post.id) ?? 0,
    commentCount: childCounts.get(post.id) ?? 0,
    liked: likedIds.has(post.id),
  }));
}

/** 单条帖子便捷封装（详情接口用） */
export async function enrichPost(
  db: D1Database,
  post: PostInfo,
  user: CurrentUser | null
): Promise<EnrichedPost> {
  const [enriched] = await enrichPosts(db, [post], user);
  return enriched;
}

// ============================================================
//  单目标查询（置顶项等少量场景）
// ============================================================

/** 查询帖子作者摘要（匿名规则由调用方传入 authorVisible 决定） */
export async function getPostAuthorBrief(
  db: D1Database,
  authorId: string,
  authorVisible: boolean,
  user: CurrentUser | null
): Promise<PostAuthorBrief | null> {
  // 匿名且无匿名查看权限 → 不返回作者
  const showAuthor = authorVisible || can(user, PERM_VIEW_ANONYMOUS_IDENTITY);
  if (!showAuthor) return null;

  const row = await db
    .prepare("SELECT userId, username, nameColor, badge FROM user_profile WHERE userId = ?")
    .bind(authorId)
    .first<{
      userId: string;
      username: string;
      nameColor: string | null;
      badge: string | null;
    }>();

  if (!row) return null;

  return {
    id: row.userId,
    username: row.username,
    nameColor: row.nameColor,
    badge: row.badge,
  };
}

/** 查询单个目标的点赞数 */
export async function getTargetLikeCount(
  db: D1Database,
  targetType: string,
  targetId: string
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM likes WHERE targetType = ? AND targetId = ?")
    .bind(targetType, targetId)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

/** 查询单个帖子的子评论数 */
export async function getChildCommentCount(
  db: D1Database,
  postId: string
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM post WHERE parentId = ? AND isDeleted = 0")
    .bind(postId)
    .first<{ count: number }>();

  return row?.count ?? 0;
}
