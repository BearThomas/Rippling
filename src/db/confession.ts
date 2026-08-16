/**
 * 表白墙数据访问层
 *
 * 底层表：confession, archive_operation
 * 安全规则：authorId 永远不直接返回，仅 view_anonymous_identity 权限可单独查身份。
 *
 * 事件溯源设计（方案 B）：
 *   - 删除操作加 isDeleted 标记，不物理删除
 *   - archive_operation 表存储完整操作链，用于归档和追责
 *
 * 归档回退：
 *   - getConfessionById 支持从加密归档文件读取（需传入 ArchiveEnv）
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { ArchiveEnv } from "../utils/archive";
import type { ArchiveFileContent } from "../utils/archive";
import { getArchivePath } from "../utils/archive";
import { decryptData } from "../utils/crypto";
import { PERM_DELETE_OTHERS_POST, PERM_VIEW_ANONYMOUS_IDENTITY } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  归档回退辅助函数
// ============================================================

/** 归档加载结果（含归档时间戳，用于热操作重放） */
interface ArchiveLoaderResult {
  result: Record<string, unknown>;
  archivedAt: string;
}

/**
 * 从加密归档文件加载表白墙数据
 *
 * 遍历最近 30 天的归档目录，找到匹配 ID 的归档文件后解密返回。
 * 使用 AbortController 设置 5 秒超时。
 */
async function loadConfessionFromArchive(
  id: string,
  archiveEnv: ArchiveEnv
): Promise<ArchiveLoaderResult | null> {
  for (let daysAgo = 0; daysAgo <= 30; daysAgo++) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const archivePath = getArchivePath("confession", id, dateStr);
    const url = `${archiveEnv.SITE_URL}/${archivePath}`;

    try {
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
      continue;
    }
  }

  return null;
}

/**
 * 重放归档之后的热操作（表白墙仅支持 delete）
 *
 * @returns null 表示归档后已被删除
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
      `SELECT operation, createdAt
       FROM archive_operation
       WHERE targetType = ? AND targetId = ? AND createdAt > ?
       ORDER BY createdAt ASC`
    )
    .bind(targetType, targetId, archivedAt)
    .all<{ operation: string; createdAt: string }>();

  for (const op of ops.results) {
    if (op.operation === "delete") return null;
  }

  return baseData;
}

// ============================================================
//  返回类型
// ============================================================

/** 表白墙条目（不含作者身份） */
export interface ConfessionInfo {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** 表白墙条目（含作者，仅 view_anonymous_identity 权限可获取） */
export interface ConfessionInfoWithAuthor extends ConfessionInfo {
  authorId: string;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 获取单条表白墙内容（带归档回退）
 *
 * 默认不返回 authorId。
 * 仅当用户有 view_anonymous_identity 权限时返回含作者信息的版本。
 * D1 中不存在或已归档时，尝试从归档文件加载。
 */
export async function getConfessionById(
  db: D1Database,
  id: string,
  user: CurrentUser | null,
  archiveEnv?: ArchiveEnv
): Promise<ConfessionInfo | ConfessionInfoWithAuthor | null> {
  const row = await db
    // 不加 isDeleted 过滤：已归档+已软删除的记录仍需从归档恢复
    .prepare("SELECT * FROM confession WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      authorId: string;
      content: string;
      isDeleted: number;
      isArchived: number;
      createdAt: string;
      updatedAt: string;
    }>();

  // D1 中已软删除 → 直接返回 null（不走归档回退）
  if (row?.isDeleted) return null;

  // D1 中存在且未归档 → 正常路径
  if (row && !row.isArchived) {
    if (can(user, PERM_VIEW_ANONYMOUS_IDENTITY)) {
      return {
        id: row.id,
        authorId: row.authorId,
        content: row.content,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }
    return {
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // D1 已归档 / 已删除 / 不存在 → 尝试从归档文件加载 + 热操作重放
  if (!archiveEnv) return null;

  const archiveData = await loadConfessionFromArchive(id, archiveEnv);

  let finalRow: Record<string, unknown> | null = null;
  let archiveTimestamp: string | null = null;

  if (archiveData) {
    archiveTimestamp = archiveData.archivedAt;
    finalRow = archiveData.result;
  } else if (row) {
    // 归档文件加载失败 → 降级使用 D1 数据
    finalRow = row as unknown as Record<string, unknown>;
  }

  if (!finalRow) return null;

  // 重放归档之后的热操作
  if (archiveTimestamp) {
    finalRow = await applyHotOperations(db, "confession", id, finalRow, archiveTimestamp);
    if (!finalRow) return null;
  }

  const aRow = finalRow as unknown as {
    id: string;
    authorId: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  };

  // 归档数据同样遵循匿名规则
  if (can(user, PERM_VIEW_ANONYMOUS_IDENTITY)) {
    return {
      id: aRow.id,
      authorId: aRow.authorId,
      content: aRow.content,
      createdAt: aRow.createdAt,
      updatedAt: aRow.updatedAt,
    };
  }

  return {
    id: aRow.id,
    content: aRow.content,
    createdAt: aRow.createdAt,
    updatedAt: aRow.updatedAt,
  };
}

/** 列出表白墙条目（按时间倒序） */
export async function listConfessions(
  db: D1Database,
  _user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<ConfessionInfo[]> {
  const rows = await db
    .prepare(
      "SELECT id, content, createdAt, updatedAt FROM confession WHERE isDeleted = 0 ORDER BY createdAt DESC LIMIT ? OFFSET ?"
    )
    .bind(limit, offset)
    .all<{
      id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>();

  return rows.results;
}

/** 发布表白墙条目 */
export async function createConfession(
  db: D1Database,
  authorId: string,
  content: string
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      "INSERT INTO confession (id, authorId, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, authorId, content, now, now)
    .run();

  return id;
}

/**
 * 软删除表白墙条目
 *
 * 需要 delete_others_post 权限。在 archive_operation 表记录 delete 操作。
 *
 * @returns false 表示无权限或条目不存在
 */
export async function softDeleteConfession(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_DELETE_OTHERS_POST)) return false;
  if (!user) return false;

  const exists = await db
    .prepare("SELECT id, isDeleted FROM confession WHERE id = ?")
    .bind(id)
    .first<{ id: string; isDeleted: number }>();

  if (!exists || exists.isDeleted) return false;

  const now = nowISO();

  // 事件溯源：记录删除操作到操作链
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'confession', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, now)
    .run();

  // 同时标记删除（不物理删除）
  await db
    .prepare("UPDATE confession SET isDeleted = 1, updatedAt = ? WHERE id = ?")
    .bind(now, id)
    .run();

  return true;
}
