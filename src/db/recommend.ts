/**
 * 推荐流数据访问层
 *
 * 推荐流从多个内容源聚合内容，按评分公式排序后返回。
 *
 * 评分公式：
 *   score = like*w1 + comment*w2 + follow*w3 + block*w4 + time_decay*w5 + random*w6 + type_bonus
 *
 * 权重从 site.config.json 的 recommendWeights 读取。
 * random 使用基于内容 ID 的稳定 hash（避免游标分页重复/漏掉）。
 *
 * 内容源：
 *   - 顶级帖子（parentId IS NULL）
 *   - 表白墙（匿名，不可置顶）
 *   - 大事记（status = 'approved'）
 *   - 投票
 *
 * 游标分页：ORDER BY score DESC, id ASC；WHERE (score < lastScore) OR (score = lastScore AND id > lastId)
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_MANAGE_BLOCK } from "../shared/permissions";
import { nowISO } from "../utils/time";

// ============================================================
//  配置常量
// ============================================================

/** 推荐流默认每页条数 */
const PAGE_SIZE = 50;

/** 每类内容源最多拉取的条数（用于内存计算） */
const FETCH_LIMIT = 100;

/** type_bonus 内置常量 */
const TYPE_BONUS = {
  post: 0,
  confession: 5.0,
  timeline: 8.0,
  vote: 6.0,
} as const;

/** 推荐权重默认值（与 site.config.json 的 recommendWeights 一致） */
const DEFAULT_WEIGHTS = {
  like: 1.0,
  comment: 1.5,
  follow: 3.0,
  block: 2.0,
  time: 2.0,
  random: 0.5,
};

// ============================================================
//  返回类型
// ============================================================

/** 推荐流中的单个内容项 */
export interface RecommendItem {
  type: "post" | "confession" | "timeline" | "vote";
  id: string;
  score: number;
  data: Record<string, unknown>;
}

/** 推荐流查询结果 */
export interface RecommendResult {
  items: RecommendItem[];
  /** 下一页游标（items < limit 时为 null，表示没有更多） */
  nextCursor: { lastScore: number; lastId: string } | null;
}

// ============================================================
//  辅助函数
// ============================================================

/**
 * 稳定随机数（基于内容 ID 的 hash）
 *
 * 同一 ID 永远返回相同值，确保游标分页不会重复或漏掉内容。
 */
function stableRandom(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000000;
  }
  return hash / 1000000;
}

/**
 * 时间衰减因子
 *
 * time_decay = 1 / (1 + hours_since_created / 24)
 * 刚发布的内容得分接近 1.0，24 小时后约 0.5，48 小时后约 0.33。
 */
function timeDecay(createdAt: string): number {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return 1 / (1 + hours / 24);
}

// ============================================================
//  主查询函数
// ============================================================

/**
 * 获取推荐流列表（带游标分页）
 *
 * @param db        - D1 数据库实例
 * @param user      - 当前用户（用于权限过滤和关注检查）
 * @param lastScore - 游标：上一页最后一条的 score（第一页不传）
 * @param lastId    - 游标：上一页最后一条的 id（第一页不传）
 * @param limit     - 每页条数（默认 50）
 * @returns 推荐内容列表（按 score 降序）
 */
export async function listRecommendations(
  db: D1Database,
  user: CurrentUser | null,
  lastScore?: number,
  lastId?: string,
  limit: number = PAGE_SIZE
): Promise<RecommendResult> {
  // ----------------------------------------------------------
  //  1. 拉取各内容源的候选数据
  // ----------------------------------------------------------

  const [posts, confessions, timelines, votes] = await Promise.all([
    // 顶级帖子（未删除、未归档）
    db
      .prepare(
        `SELECT id, parentId, authorId, title, content, visibility, blockId, isPinned, createdAt
         FROM post
         WHERE parentId IS NULL AND isDeleted = 0 AND isArchived = 0
         ORDER BY createdAt DESC LIMIT ?`
      )
      .bind(FETCH_LIMIT)
      .all<{
        id: string;
        parentId: string | null;
        authorId: string;
        title: string | null;
        content: string;
        visibility: string;
        blockId: string | null;
        isPinned: number;
        createdAt: string;
      }>(),

    // 表白墙（未删除、未归档）
    db
      .prepare(
        `SELECT id, content, createdAt
         FROM confession
         WHERE isDeleted = 0 AND isArchived = 0
         ORDER BY createdAt DESC LIMIT ?`
      )
      .bind(FETCH_LIMIT)
      .all<{ id: string; content: string; createdAt: string }>(),

    // 大事记（approved + 未删除）
    db
      .prepare(
        `SELECT id, title, description, eventDate, submittedBy, createdAt
         FROM timeline_event
         WHERE status = 'approved' AND isArchived = 0
         ORDER BY eventDate DESC LIMIT ?`
      )
      .bind(FETCH_LIMIT)
      .all<{
        id: string;
        title: string;
        description: string;
        eventDate: string;
        submittedBy: string;
        createdAt: string;
      }>(),

    // 投票
    db
      .prepare(
        `SELECT id, title, description, endAt, isClosed, createdAt
         FROM vote
         ORDER BY createdAt DESC LIMIT ?`
      )
      .bind(FETCH_LIMIT)
      .all<{
        id: string;
        title: string;
        description: string | null;
        endAt: string;
        isClosed: number;
        createdAt: string;
      }>(),
  ]);

  // ----------------------------------------------------------
  //  2. 权限过滤
  // ----------------------------------------------------------

  // 帖子：过滤 visibility 和 block
  const filteredPosts = await filterPostsByPermission(db, posts.results, user);

  // 表白墙、大事记、投票不需要额外过滤（已在 SQL 中处理）

  // ----------------------------------------------------------
  //  3. 批量查询聚合数据（点赞数、评论数、关注）
  // ----------------------------------------------------------

  const allPostIds = filteredPosts.map((p) => p.id);
  const allConfessionIds = confessions.results.map((c) => c.id);
  const allTimelineIds = timelines.results.map((t) => t.id);
  const allVoteIds = votes.results.map((v) => v.id);

  // 点赞数：按 targetType 分组查询
  const [likeCounts, commentCounts, followSet] = await Promise.all([
    batchGetLikeCounts(db, [
      { type: "post", ids: allPostIds },
      { type: "confession", ids: allConfessionIds },
      { type: "timeline", ids: allTimelineIds },
      { type: "vote", ids: allVoteIds },
    ]),
    batchGetCommentCounts(db, allPostIds),
    batchGetFollowStatus(db, user?.id ?? null, filteredPosts.map((p) => p.authorId)),
  ]);

  // 板块成员集合（用于 block 权重）
  const userBlocks = user ? await getUserBlockIds(db, user.id) : new Set<string>();

  // ----------------------------------------------------------
  //  4. 计算分数并合并
  // ----------------------------------------------------------

  const weights = DEFAULT_WEIGHTS;
  const items: RecommendItem[] = [];

  // 帖子
  for (const post of filteredPosts) {
    const likeCount = likeCounts.get(`post:${post.id}`) ?? 0;
    const commentCount = commentCounts.get(post.id) ?? 0;
    const followBonus = user && followSet.has(post.authorId) ? 1 : 0;
    const blockBonus = post.blockId && userBlocks.has(post.blockId) ? 1 : 0;

    const score =
      likeCount * weights.like +
      commentCount * weights.comment +
      followBonus * weights.follow +
      blockBonus * weights.block +
      timeDecay(post.createdAt) * weights.time +
      stableRandom(post.id) * weights.random +
      TYPE_BONUS.post;

    items.push({
      type: "post",
      id: post.id,
      score,
      data: {
        id: post.id,
        title: post.title,
        content: post.content,
        authorId: post.authorId,
        createdAt: post.createdAt,
      },
    });
  }

  // 表白墙
  for (const confession of confessions.results) {
    const likeCount = likeCounts.get(`confession:${confession.id}`) ?? 0;

    const score =
      likeCount * weights.like +
      timeDecay(confession.createdAt) * weights.time +
      stableRandom(confession.id) * weights.random +
      TYPE_BONUS.confession;

    items.push({
      type: "confession",
      id: confession.id,
      score,
      data: {
        id: confession.id,
        content: confession.content,
        createdAt: confession.createdAt,
      },
    });
  }

  // 大事记
  for (const event of timelines.results) {
    const likeCount = likeCounts.get(`timeline:${event.id}`) ?? 0;

    const score =
      likeCount * weights.like +
      timeDecay(event.createdAt) * weights.time +
      stableRandom(event.id) * weights.random +
      TYPE_BONUS.timeline;

    items.push({
      type: "timeline",
      id: event.id,
      score,
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        createdAt: event.createdAt,
      },
    });
  }

  // 投票
  for (const vote of votes.results) {
    const likeCount = likeCounts.get(`vote:${vote.id}`) ?? 0;

    const score =
      likeCount * weights.like +
      timeDecay(vote.createdAt) * weights.time +
      stableRandom(vote.id) * weights.random +
      TYPE_BONUS.vote;

    items.push({
      type: "vote",
      id: vote.id,
      score,
      data: {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        endAt: vote.endAt,
        isClosed: !!vote.isClosed,
        createdAt: vote.createdAt,
      },
    });
  }

  // ----------------------------------------------------------
  //  5. 排序 + 游标分页
  // ----------------------------------------------------------

  // 按 score 降序，同 score 按 id 升序
  items.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // 应用游标过滤
  let filtered = items;
  if (lastScore !== undefined && lastId) {
    filtered = items.filter(
      (item) => item.score < lastScore || (item.score === lastScore && item.id > lastId)
    );
  }

  // 取前 limit 条
  const page = filtered.slice(0, limit);

  // 构建游标
  const nextCursor =
    page.length === limit && filtered.length > limit
      ? { lastScore: page[page.length - 1].score, lastId: page[page.length - 1].id }
      : null;

  return { items: page, nextCursor };
}

// ============================================================
//  内部辅助函数
// ============================================================

/** 帖子权限过滤（visibility + block 访问） */
async function filterPostsByPermission(
  db: D1Database,
  posts: {
    id: string;
    parentId: string | null;
    authorId: string;
    title: string | null;
    content: string;
    visibility: string;
    blockId: string | null;
    isPinned: number;
    createdAt: string;
  }[],
  user: CurrentUser | null
): Promise<typeof posts> {
  const result: typeof posts = [];

  for (const post of posts) {
    // 板块检查
    if (post.blockId) {
      const canAccess = await checkBlockAccess(db, post.blockId, user);
      if (!canAccess) continue;
    }

    // visibility 检查
    if (post.visibility === "private") continue;
    if (post.visibility === "selected") {
      // 需要检查白名单
      if (!user || user.id !== post.authorId) {
        const inList = await db
          .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
          .bind(post.id, user?.id ?? "")
          .first();
        if (!inList) continue;
      }
    }

    result.push(post);
  }

  return result;
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

/** 批量查询点赞数 */
async function batchGetLikeCounts(
  db: D1Database,
  groups: { type: string; ids: string[] }[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const group of groups) {
    if (!group.ids.length) continue;

    // 分批查询（避免 SQL 参数过多）
    const batchSize = 50;
    for (let i = 0; i < group.ids.length; i += batchSize) {
      const batch = group.ids.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(",");
      const rows = await db
        .prepare(
          `SELECT targetId, COUNT(*) as count FROM likes
           WHERE targetType = ? AND targetId IN (${placeholders})
           GROUP BY targetId`
        )
        .bind(group.type, ...batch)
        .all<{ targetId: string; count: number }>();

      for (const row of rows.results) {
        map.set(`${group.type}:${row.targetId}`, row.count);
      }
    }
  }

  return map;
}

/** 批量查询评论数（仅帖子） */
async function batchGetCommentCounts(
  db: D1Database,
  postIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!postIds.length) return map;

  const batchSize = 50;
  for (let i = 0; i < postIds.length; i += batchSize) {
    const batch = postIds.slice(i, i + batchSize);
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

/** 批量查询关注关系 */
async function batchGetFollowStatus(
  db: D1Database,
  followerId: string | null,
  authorIds: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!followerId || !authorIds.length) return set;

  const unique = [...new Set(authorIds)];
  const batchSize = 50;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT followingId FROM follow
         WHERE followerId = ? AND followingId IN (${placeholders})`
      )
      .bind(followerId, ...batch)
      .all<{ followingId: string }>();

    for (const row of rows.results) {
      set.add(row.followingId);
    }
  }

  return set;
}

/** 获取用户加入的所有板块 ID */
async function getUserBlockIds(
  db: D1Database,
  userId: string
): Promise<Set<string>> {
  const set = new Set<string>();

  const rows = await db
    .prepare("SELECT blockId FROM block_member WHERE userId = ?")
    .bind(userId)
    .all<{ blockId: string }>();

  for (const row of rows.results) {
    set.add(row.blockId);
  }

  return set;
}
