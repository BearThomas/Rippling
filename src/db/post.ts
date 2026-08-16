/**
 * 帖子 / 评论数据访问层
 *
 * 包含帖子和评论的查询、创建、编辑（事件溯源）、软删除、置顶。
 * 所有查询函数内部完成字段过滤和权限检查：无权限 = 返回 null。
 *
 * 底层表：post, post_visibility, archive_operation
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import {
  PERM_VIEW_ANONYMOUS_IDENTITY,
  PERM_MANAGE_BLOCK,
  PERM_EDIT_OWN_POST,
  PERM_EDIT_OTHERS_POST,
  PERM_DELETE_OWN_POST,
  PERM_DELETE_OTHERS_POST,
  PERM_PIN_POST,
} from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  返回类型
// ============================================================

/** 过滤后的帖子对象（authorId 根据权限条件返回） */
export interface PostInfo {
  id: string;
  parentId: string | null;
  /** 仅当 authorVisible=1 或 currentUser 有权查看时存在 */
  authorId: string | null;
  title: string | null;
  content: string;
  visibility: string;
  blockId: string | null;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
//  内部辅助函数
// ============================================================

/** 检查用户是否有查看匿名身份的权限 */
function hasAnonView(user: CurrentUser | null): boolean {
  return can(user, PERM_VIEW_ANONYMOUS_IDENTITY);
}

/**
 * 检查用户是否可访问指定板块
 *
 * 无 blockId → 可访问
 * 有 manage_block 全站权限 → 可访问
 * 是板块成员 → 可访问
 */
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

/**
 * 过滤帖子字段
 *
 * 根据权限决定是否返回 authorId。
 * 返回 null 表示该帖子对当前用户不可见（404）。
 */
function filterPostFields(
  row: {
    id: string;
    parentId: string | null;
    authorId: string;
    authorVisible: number;
    title: string | null;
    content: string;
    visibility: string;
    blockId: string | null;
    isPinned: number;
    isArchived: number;
    createdAt: string;
    updatedAt: string;
  },
  user: CurrentUser | null
): PostInfo {
  // authorVisible=1 或有匿名查看权限 → 返回 authorId
  // 匿名帖（authorVisible=0）不因“作者本人”而显示，仅 view_anonymous_identity 权限可查看
  const showAuthor =
    row.authorVisible === 1 ||
    hasAnonView(user);

  return {
    id: row.id,
    parentId: row.parentId,
    authorId: showAuthor ? row.authorId : null,
    title: row.title,
    content: row.content,
    visibility: row.visibility,
    blockId: row.blockId,
    isPinned: !!row.isPinned,
    isArchived: !!row.isArchived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 检查帖子可见性（visibility = 'selected' 白名单模式）
 *
 * 以下情况可见：
 *   - visibility 不是 'selected'
 *   - currentUser 是作者
 *   - currentUser 有 view_anonymous_identity 权限
 *   - currentUser 在 post_visibility 白名单中
 */
async function checkPostVisibility(
  db: D1Database,
  postId: string,
  authorId: string,
  visibility: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (visibility !== "selected") return true;
  if (user?.id === authorId) return true;
  if (hasAnonView(user)) return true;
  if (!user) return false;

  const inList = await db
    .prepare("SELECT id FROM post_visibility WHERE postId = ? AND userId = ?")
    .bind(postId, user.id)
    .first();

  return !!inList;
}

// ============================================================
//  导出函数
// ============================================================

/**
 * 获取单个帖子（带完整权限检查）
 *
 * 返回 null 表示：帖子不存在 / 无可见性权限 / 无板块权限
 */
export async function getPostById(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<PostInfo | null> {
  const row = await db
    .prepare("SELECT * FROM post WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      parentId: string | null;
      authorId: string;
      authorVisible: number;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      isPinned: number;
      isArchived: number;
      createdAt: string;
      updatedAt: string;
    }>();

  if (!row) return null;

  // 可见性白名单检查
  const visible = await checkPostVisibility(
    db, row.id, row.authorId, row.visibility, user
  );
  if (!visible) return null;

  // 板块访问检查
  if (!(await canAccessBlock(db, row.blockId, user))) return null;

  return filterPostFields(row, user);
}

/**
 * 列出某帖子/评论下的子评论
 *
 * 应用与 getPostById 相同的可见性和板块过滤。
 * 按 createdAt 升序排列。
 */
export async function listPostsByParent(
  db: D1Database,
  parentId: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<PostInfo[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM post WHERE parentId = ? ORDER BY createdAt ASC LIMIT ? OFFSET ?"
    )
    .bind(parentId, limit, offset)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      authorVisible: number;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      isPinned: number;
      isArchived: number;
      createdAt: string;
      updatedAt: string;
    }>();

  const results: PostInfo[] = [];
  for (const row of rows.results) {
    const visible = await checkPostVisibility(
      db, row.id, row.authorId, row.visibility, user
    );
    if (!visible) continue;
    if (!(await canAccessBlock(db, row.blockId, user))) continue;
    results.push(filterPostFields(row, user));
  }

  return results;
}

/**
 * 列出某用户的顶级帖子（parentId IS NULL）
 *
 * 应用可见性和板块过滤。按 createdAt 倒序。
 */
export async function listUserPosts(
  db: D1Database,
  userId: string,
  user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<PostInfo[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM post WHERE authorId = ? AND parentId IS NULL ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    )
    .bind(userId, limit, offset)
    .all<{
      id: string;
      parentId: string | null;
      authorId: string;
      authorVisible: number;
      title: string | null;
      content: string;
      visibility: string;
      blockId: string | null;
      isPinned: number;
      isArchived: number;
      createdAt: string;
      updatedAt: string;
    }>();

  const results: PostInfo[] = [];
  for (const row of rows.results) {
    const visible = await checkPostVisibility(
      db, row.id, row.authorId, row.visibility, user
    );
    if (!visible) continue;
    if (!(await canAccessBlock(db, row.blockId, user))) continue;
    results.push(filterPostFields(row, user));
  }

  return results;
}

/** 创建帖子/评论的数据参数 */
export interface CreatePostData {
  parentId?: string | null;
  authorId: string;
  authorVisible?: boolean;
  title?: string | null;
  content: string;
  visibility?: string;
  blockId?: string | null;
}

/**
 * 创建帖子
 *
 * 如果 visibility = 'selected'，同时写入 post_visibility 白名单。
 */
export async function createPost(
  db: D1Database,
  data: CreatePostData,
  _user: CurrentUser
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();
  const visibility = data.visibility ?? "public";
  const authorVisible = data.authorVisible !== false;

  await db
    .prepare(
      `INSERT INTO post (id, parentId, authorId, authorVisible, title, content, visibility, blockId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.parentId ?? null,
      data.authorId,
      authorVisible ? 1 : 0,
      data.title ?? null,
      data.content,
      visibility,
      data.blockId ?? null,
      now,
      now
    )
    .run();

  return id;
}

/**
 * 创建帖子（含可见性白名单）
 *
 * @param visibleUserIds - visibility='selected' 时可见的用户 ID 列表
 */
export async function createPostWithVisibility(
  db: D1Database,
  data: CreatePostData & { visibleUserIds?: string[] },
  user: CurrentUser
): Promise<string> {
  const id = await createPost(db, data, user);
  const now = nowISO();

  // 写入白名单
  if (data.visibility === "selected" && data.visibleUserIds?.length) {
    for (const uid of data.visibleUserIds) {
      await db
        .prepare(
          "INSERT INTO post_visibility (id, postId, userId, createdAt) VALUES (?, ?, ?, ?)"
        )
        .bind(generateUUID(), id, uid, now)
        .run();
    }
  }

  return id;
}

/**
 * 编辑帖子内容（事件溯源）
 *
 * 不直接修改原数据，而是在 archive_operation 表记录 edit 操作。
 * 权限：作者本人（且未归档）或 edit_others_post 权限。
 *
 * @returns false 表示无权限或帖子不存在
 */
export async function updatePostContent(
  db: D1Database,
  id: string,
  content: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const post = await db
    .prepare("SELECT authorId, isArchived FROM post WHERE id = ?")
    .bind(id)
    .first<{ authorId: string; isArchived: number }>();

  if (!post) return false;

  const isAuthor = post.authorId === user.id;
  const canEditOthers = can(user, PERM_EDIT_OTHERS_POST);
  const canEditOwn = can(user, PERM_EDIT_OWN_POST);

  // 作者本人需未归档且有 edit_own_post 权限；非作者需 edit_others_post
  if (isAuthor) {
    if (post.isArchived || !canEditOwn) return false;
  } else if (!canEditOthers) {
    return false;
  }

  // 事件溯源：记录编辑操作
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operationData, operatedBy, createdAt)
       VALUES (?, 'post', ?, 'edit', ?, ?, ?)`
    )
    .bind(generateUUID(), id, content, user.id, nowISO())
    .run();

  return true;
}

/**
 * 软删除帖子（事件溯源）
 *
 * 权限：作者本人（需 delete_own_post）或 delete_others_post 权限。
 * 在 archive_operation 表记录 delete 操作。
 *
 * @returns false 表示无权限或帖子不存在
 */
export async function softDeletePost(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const post = await db
    .prepare("SELECT authorId FROM post WHERE id = ?")
    .bind(id)
    .first<{ authorId: string }>();

  if (!post) return false;

  const isAuthor = post.authorId === user.id;
  const canDeleteOthers = can(user, PERM_DELETE_OTHERS_POST);
  const canDeleteOwn = can(user, PERM_DELETE_OWN_POST);

  if (isAuthor) {
    if (!canDeleteOwn) return false;
  } else if (!canDeleteOthers) {
    return false;
  }

  // 事件溯源：记录删除操作
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'post', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, nowISO())
    .run();

  return true;
}

/**
 * 置顶 / 取消置顶帖子
 *
 * 需要 pin_post 权限。直接更新 isPinned（状态字段，非内容）。
 *
 * @returns false 表示无权限或帖子不存在
 */
export async function pinPost(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_PIN_POST)) return false;

  const post = await db
    .prepare("SELECT id, isPinned FROM post WHERE id = ?")
    .bind(id)
    .first<{ id: string; isPinned: number }>();

  if (!post) return false;

  await db
    .prepare("UPDATE post SET isPinned = ? WHERE id = ?")
    .bind(post.isPinned ? 0 : 1, id)
    .run();

  return true;
}
