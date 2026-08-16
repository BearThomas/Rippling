/**
 * 帖子 / 评论数据访问层
 *
 * 包含帖子和评论的查询、创建、编辑（事件溯源）、软删除、置顶。
 * 所有查询函数内部完成字段过滤和权限检查：无权限 = 返回 null。
 *
 * 底层表：post, post_visibility, archive_operation
 *
 * 事件溯源设计（方案 B）：
 *   - post 表的内容字段存储当前最终状态，读取时直接读，不实时重放
 *   - archive_operation 表存储完整操作链（edit / delete），用于归档和追责
 *   - 删除操作加 isDeleted 标记，不物理删除
 *   - 归档时最终状态作为结果文件
 *
 * 归档回退：
 *   - getPostById 支持从加密归档文件读取（需传入 ArchiveEnv）
 *   - D1 中 isArchived=1 或记录不存在时，尝试从归档文件加载
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { ArchiveEnv } from "../utils/archive";
import type { ArchiveFileContent } from "../utils/archive";
import { getArchivePath } from "../utils/archive";
import { decryptData } from "../utils/crypto";
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
//  归档回退辅助函数
// ============================================================

/** 归档加载结果（含归档时间戳，用于热操作重放） */
interface ArchiveLoaderResult {
  result: Record<string, unknown>;
  /** 归档执行时间（ISO 8601），仅重放此时间之后的操作 */
  archivedAt: string;
}

/**
 * 从加密归档文件加载帖子数据
 *
 * 归档文件存储在站点的 /archive/ 路径下（静态资源），
 * 通过 HTTP fetch 获取后解密还原。
 * 使用 AbortController 设置 5 秒超时，避免 fetch 挂起。
 */
async function loadPostFromArchive(
  id: string,
  archiveEnv: ArchiveEnv
): Promise<ArchiveLoaderResult | null> {
  // 尝试从今天和过去几天的归档目录中查找
  // 简化处理：遍历最近 30 天的日期
  for (let daysAgo = 0; daysAgo <= 30; daysAgo++) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const archivePath = getArchivePath("post", id, dateStr);
    const url = `${archiveEnv.SITE_URL}/${archivePath}`;

    try {
      // 5 秒超时控制，避免 fetch 挂起阻塞请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) continue;

      const encrypted = await resp.text();
      const archive = (await decryptData(
        encrypted,
        archiveEnv.ENCRYPTION_KEY
      )) as ArchiveFileContent;

      return { result: archive.result, archivedAt: archive.archivedAt };
    } catch {
      // 文件不存在、解密失败、超时或网络错误 → 继续尝试其他日期
      continue;
    }
  }

  return null;
}

/**
 * 重放归档之后的热操作
 *
 * 查询 archive_operation 表中归档时间之后的操作记录，
 * 按时间顺序应用到归档数据上：
 *   - edit → 更新 content 和 updatedAt
 *   - delete → 返回 null（帖子已被删除）
 *
 * @returns 应用操作后的数据，null 表示已被删除
 */
async function applyHotOperations(
  db: D1Database,
  targetType: string,
  targetId: string,
  baseData: Record<string, unknown>,
  archivedAt: string
): Promise<Record<string, unknown> | null> {
  const ops = await db
    .prepare(
      `SELECT operation, operationData, createdAt
       FROM archive_operation
       WHERE targetType = ? AND targetId = ? AND createdAt > ?
       ORDER BY createdAt ASC`
    )
    .bind(targetType, targetId, archivedAt)
    .all<{ operation: string; operationData: string | null; createdAt: string }>();

  const data = { ...baseData };

  for (const op of ops.results) {
    if (op.operation === "delete") {
      return null; // 归档后被删除
    }
    if (op.operation === "edit" && op.operationData) {
      data.content = op.operationData;
      data.updatedAt = op.createdAt;
    }
  }

  return data;
}

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
 * 获取单个帖子（带完整权限检查 + 归档回退）
 *
 * 查询优先级：
 *   1. D1 热数据（isArchived=0）
 *   2. D1 已归档记录（isArchived=1）→ 从归档文件读取最终状态
 *   3. D1 不存在 → 尝试从归档文件加载
 *
 * 返回 null 表示：帖子不存在 / 无可见性权限 / 无板块权限 / 归档文件不存在
 */
export async function getPostById(
  db: D1Database,
  id: string,
  user: CurrentUser | null,
  archiveEnv?: ArchiveEnv
): Promise<PostInfo | null> {
  const row = await db
    // 不加 isDeleted 过滤：已归档+已软删除的记录仍需从归档恢复
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
      isDeleted: number;
      createdAt: string;
      updatedAt: string;
    }>();

  // D1 中已软删除 → 直接返回 null（不走归档回退）
  if (row?.isDeleted) return null;

  // D1 中存在且未归档 → 正常路径
  if (row && !row.isArchived) {
    const visible = await checkPostVisibility(
      db, row.id, row.authorId, row.visibility, user
    );
    if (!visible) return null;
    if (!(await canAccessBlock(db, row.blockId, user))) return null;
    return filterPostFields(row, user);
  }

  // D1 已归档 / 已删除 / 不存在 → 尝试从归档文件加载 + 热操作重放
  if (!archiveEnv) return null;

  const archiveData = await loadPostFromArchive(id, archiveEnv);

  // 确定最终行数据：归档文件 > D1 降级 > null
  let finalRow: Record<string, unknown> | null = null;
  let archiveTimestamp: string | null = null;

  if (archiveData) {
    archiveTimestamp = archiveData.archivedAt;
    finalRow = archiveData.result;
  } else if (row) {
    // 归档文件加载失败 → 降级使用 D1 数据（即使 isArchived=1）
    finalRow = row as unknown as Record<string, unknown>;
  }

  if (!finalRow) return null;

  // 重放归档之后的热操作（归档后的 edit / delete）
  if (archiveTimestamp) {
    finalRow = await applyHotOperations(db, "post", id, finalRow, archiveTimestamp);
    if (!finalRow) return null; // 归档后被删除
  }

  const aRow = finalRow as unknown as {
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
    isDeleted: number;
    createdAt: string;
    updatedAt: string;
  };

  // 归档数据仍需检查可见性白名单和板块权限
  const visible = await checkPostVisibility(
    db, aRow.id, aRow.authorId, aRow.visibility, user
  );
  if (!visible) return null;
  if (!(await canAccessBlock(db, aRow.blockId, user))) return null;

  return filterPostFields(aRow, user);
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
      "SELECT * FROM post WHERE parentId = ? AND isDeleted = 0 ORDER BY createdAt ASC LIMIT ? OFFSET ?"
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
      "SELECT * FROM post WHERE authorId = ? AND parentId IS NULL AND isDeleted = 0 ORDER BY createdAt DESC LIMIT ? OFFSET ?"
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
 * 编辑帖子内容（事件溯源 — 双写）
 *
 * 同时更新当前内容（post.content）和记录操作链（archive_operation）。
 * 读取时直接读 post.content，不重放操作链。
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

  const now = nowISO();

  // 事件溯源：记录编辑操作到操作链
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operationData, operatedBy, createdAt)
       VALUES (?, 'post', ?, 'edit', ?, ?, ?)`
    )
    .bind(generateUUID(), id, content, user.id, now)
    .run();

  // 同时更新当前内容为最终状态（方案 B：读取时直接读）
  await db
    .prepare("UPDATE post SET content = ?, updatedAt = ? WHERE id = ?")
    .bind(content, now, id)
    .run();

  return true;
}

/**
 * 软删除帖子（事件溯源 — 双写）
 *
 * 同时标记 isDeleted=1 和记录操作链（archive_operation）。
 * 权限：作者本人（需 delete_own_post）或 delete_others_post 权限。
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
    .prepare("SELECT authorId, isDeleted FROM post WHERE id = ?")
    .bind(id)
    .first<{ authorId: string; isDeleted: number }>();

  if (!post || post.isDeleted) return false;

  const isAuthor = post.authorId === user.id;
  const canDeleteOthers = can(user, PERM_DELETE_OTHERS_POST);
  const canDeleteOwn = can(user, PERM_DELETE_OWN_POST);

  if (isAuthor) {
    if (!canDeleteOwn) return false;
  } else if (!canDeleteOthers) {
    return false;
  }

  const now = nowISO();

  // 事件溯源：记录删除操作到操作链
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'post', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, now)
    .run();

  // 同时标记删除（不物理删除）
  await db
    .prepare("UPDATE post SET isDeleted = 1, updatedAt = ? WHERE id = ?")
    .bind(now, id)
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
    .prepare("SELECT id, isPinned FROM post WHERE id = ? AND isDeleted = 0")
    .bind(id)
    .first<{ id: string; isPinned: number }>();

  if (!post) return false;

  await db
    .prepare("UPDATE post SET isPinned = ? WHERE id = ?")
    .bind(post.isPinned ? 0 : 1, id)
    .run();

  return true;
}
