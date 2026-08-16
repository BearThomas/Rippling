/**
 * 大事记数据访问层
 *
 * 底层表：timeline_event
 * 规则：只返回 status = 'approved' 的条目（未审核/被拒绝 → 404）。
 *
 * 归档回退：
 *   - getTimelineEventById 支持从加密归档文件读取（需传入 ArchiveEnv）
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { ArchiveEnv } from "../utils/archive";
import type { ArchiveFileContent } from "../utils/archive";
import { getArchivePath } from "../utils/archive";
import { decryptData } from "../utils/crypto";
import { PERM_SUBMIT_TIMELINE, PERM_REVIEW_TIMELINE } from "../shared/permissions";
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
 * 从加密归档文件加载大事记数据
 *
 * 遍历最近 30 天的归档目录，找到匹配 ID 的归档文件后解密返回。
 * 使用 AbortController 设置 5 秒超时。
 */
async function loadTimelineFromArchive(
  id: string,
  archiveEnv: ArchiveEnv
): Promise<ArchiveLoaderResult | null> {
  for (let daysAgo = 0; daysAgo <= 30; daysAgo++) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const archivePath = getArchivePath("timeline", id, dateStr);
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
 * 重放归档之后的热操作（大事记无 edit/delete 操作，直接返回原数据）
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

/** 大事记条目（仅 approved 状态对外可见） */
export interface TimelineEventInfo {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  submittedBy: string;
  createdAt: string;
}

/** 大事记条目（管理视图，含审核信息） */
export interface TimelineEventAdmin extends TimelineEventInfo {
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** 用户提交的大事记（含审核状态，用于 /my 列表） */
export interface UserTimelineInfo {
  id: string;
  title: string;
  status: string;
  eventDate: string;
  createdAt: string;
}

// ============================================================
//  提交数据
// ============================================================

/** 提交大事记的输入参数 */
export interface SubmitTimelineData {
  title: string;
  description: string;
  eventDate: string;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 列出大事记（仅 approved）
 *
 * 按 eventDate 倒序排列。
 */
export async function listTimelineEvents(
  db: D1Database,
  _user: CurrentUser | null,
  limit: number,
  offset: number
): Promise<TimelineEventInfo[]> {
  const rows = await db
    .prepare(
      `SELECT id, title, description, eventDate, submittedBy, createdAt
       FROM timeline_event WHERE status = 'approved'
       ORDER BY eventDate DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      submittedBy: string;
      createdAt: string;
    }>();

  return rows.results;
}

/**
 * 获取单条大事记（带归档回退）
 *
 * status 必须为 'approved'，否则返回 null（404）。
 * D1 中不存在时，尝试从归档文件加载。
 */
export async function getTimelineEventById(
  db: D1Database,
  id: string,
  _user: CurrentUser | null,
  archiveEnv?: ArchiveEnv
): Promise<TimelineEventInfo | null> {
  const row = await db
    .prepare(
      `SELECT id, title, description, eventDate, submittedBy, isArchived, createdAt
       FROM timeline_event WHERE id = ? AND status = 'approved'`
    )
    .bind(id)
    .first<{
      id: string;
      title: string;
      description: string;
      eventDate: string;
      submittedBy: string;
      isArchived: number;
      createdAt: string;
    }>();

  // D1 中存在且未归档 → 正常路径
  if (row && !row.isArchived) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      eventDate: row.eventDate,
      submittedBy: row.submittedBy,
      createdAt: row.createdAt,
    };
  }

  // D1 已归档或不存在 → 尝试从归档文件加载 + 热操作重放
  if (!archiveEnv) return null;

  const archiveData = await loadTimelineFromArchive(id, archiveEnv);

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
    finalRow = await applyHotOperations(db, "timeline", id, finalRow, archiveTimestamp);
    if (!finalRow) return null;
  }

  const aRow = finalRow as unknown as {
    id: string;
    title: string;
    description: string;
    eventDate: string;
    submittedBy: string;
    createdAt: string;
  };

  return {
    id: aRow.id,
    title: aRow.title,
    description: aRow.description,
    eventDate: aRow.eventDate,
    submittedBy: aRow.submittedBy,
    createdAt: aRow.createdAt,
  };
}

/**
 * 提交大事记（status = 'pending'）
 *
 * 需要 submit_timeline 权限。
 *
 * @returns 新大事记 ID，无权限返回 null
 */
export async function submitTimeline(
  db: D1Database,
  data: SubmitTimelineData,
  user: CurrentUser | null
): Promise<string | null> {
  if (!can(user, PERM_SUBMIT_TIMELINE)) return null;
  if (!user) return null;

  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO timeline_event (id, title, description, eventDate, status, submittedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .bind(id, data.title, data.description, data.eventDate, user.id, now, now)
    .run();

  return id;
}

/**
 * 审核大事记
 *
 * 需要 review_timeline 权限。
 * 更新 status、reviewedBy、reviewedAt。
 *
 * @returns false 表示无权限或条目不存在
 */
export async function reviewTimeline(
  db: D1Database,
  id: string,
  status: "approved" | "rejected",
  user: CurrentUser | null,
  reason?: string
): Promise<boolean> {
  if (!can(user, PERM_REVIEW_TIMELINE)) return false;
  if (!user) return false;

  const exists = await db
    .prepare("SELECT id FROM timeline_event WHERE id = ?")
    .bind(id)
    .first();

  if (!exists) return false;

  const now = nowISO();

  await db
    .prepare(
      "UPDATE timeline_event SET status = ?, reviewedBy = ?, reviewedAt = ?, updatedAt = ? WHERE id = ?"
    )
    .bind(status, user.id, now, now, id)
    .run();

  // 拒绝时记录原因到操作链
  if (status === "rejected" && reason) {
    await db
      .prepare(
        `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, operationData, createdAt)
         VALUES (?, 'timeline_event', ?, 'reject', ?, ?, ?)`
      )
      .bind(generateUUID(), id, user.id, reason, now)
      .run();
  }

  return true;
}

/**
 * 列出某用户提交的所有大事记（含 pending / approved / rejected）
 *
 * 按 createdAt 倒序。
 */
export async function listUserTimelines(
  db: D1Database,
  userId: string
): Promise<UserTimelineInfo[]> {
  const rows = await db
    .prepare(
      `SELECT id, title, status, eventDate, createdAt
       FROM timeline_event WHERE submittedBy = ?
       ORDER BY createdAt DESC`
    )
    .bind(userId)
    .all<{
      id: string;
      title: string;
      status: string;
      eventDate: string;
      createdAt: string;
    }>();

  return rows.results;
}

/**
 * 获取大事记审核信息（reviewedBy / reviewedAt）
 *
 * 供路由层在权限检查后调用，判断是否返回审核详情。
 */
export async function getTimelineReviewInfo(
  db: D1Database,
  id: string
): Promise<{ reviewedBy: string | null; reviewedAt: string | null } | null> {
  const row = await db
    .prepare("SELECT reviewedBy, reviewedAt FROM timeline_event WHERE id = ?")
    .bind(id)
    .first<{ reviewedBy: string | null; reviewedAt: string | null }>();

  return row;
}
