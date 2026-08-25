/**
 * 归档查看器数据访问层
 *
 * 底层表：archive_index（由归档脚本 scripts/archive.ts 写入）
 * 归档文件为加密静态资源，通过 SITE_URL fetch + ENCRYPTION_KEY 解密读取。
 *
 * 安全设计：
 *   - 文件路径白名单：仅允许读取 archive_index 表中登记过的路径，
 *     从根本上防止路径穿越（../ 等）。
 */

import type { ArchiveEnv, ArchiveFileContent } from "../utils/archive";
import { decryptData } from "../utils/crypto";

// ============================================================
//  类型定义
// ============================================================

/** 归档文件索引信息 */
export interface ArchiveFileInfo {
  id: string;
  filePath: string;
  targetType: string | null;
  targetId: string | null;
  archivedAt: string;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 列出归档文件（archive_index 表，按归档时间倒序）
 *
 * limit 默认 50，上限 100。
 */
export async function listArchiveFiles(
  db: D1Database,
  limit = 50,
  offset = 0
): Promise<ArchiveFileInfo[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  const rows = await db
    .prepare(
      `SELECT id, filePath, targetType, targetId, archivedAt
       FROM archive_index
       ORDER BY archivedAt DESC LIMIT ? OFFSET ?`
    )
    .bind(safeLimit, safeOffset)
    .all<ArchiveFileInfo>();

  return rows.results;
}

/**
 * 读取归档文件内容（解密后）
 *
 * 流程：
 *   1. 校验 filePath 是否在 archive_index 白名单中（防路径穿越）
 *   2. 通过 SITE_URL fetch 静态归档文件（5 秒超时）
 *   3. 用 ENCRYPTION_KEY 解密，返回完整归档内容（含 result 与操作链）
 *
 * @returns 路径未登记、fetch 失败或解密失败时返回 null
 */
export async function getArchiveFileContent(
  db: D1Database,
  filePath: string,
  archiveEnv: ArchiveEnv
): Promise<ArchiveFileContent | null> {
  // 白名单校验：仅允许 archive_index 中登记过的路径
  const registered = await db
    .prepare("SELECT id FROM archive_index WHERE filePath = ?")
    .bind(filePath)
    .first();

  if (!registered) return null;

  // 双重保险：路径必须以 archive/ 开头且不含 ".."
  if (!filePath.startsWith("archive/") || filePath.includes("..")) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${archiveEnv.SITE_URL}/${filePath}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;

    const encrypted = await resp.text();
    const content = (await decryptData(
      encrypted,
      archiveEnv.ENCRYPTION_KEY
    )) as ArchiveFileContent;

    return content;
  } catch {
    return null;
  }
}
