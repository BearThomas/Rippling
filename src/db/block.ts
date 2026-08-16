/**
 * 板块数据访问层
 *
 * 底层表：block, block_member, block_join_request, block_blacklist, archive_operation
 * 规则：已删除板块 → 404；锁定板块非成员不可见。
 *
 * 归档回退：
 *   - getBlockById 支持从加密归档文件读取（需传入 ArchiveEnv）
 *   - 优先级较低，仅在 D1 中不存在时回退
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import type { ArchiveEnv } from "../utils/archive";
import type { ArchiveFileContent } from "../utils/archive";
import { getArchivePath } from "../utils/archive";
import { decryptData } from "../utils/crypto";
import {
  PERM_MANAGE_BLOCK,
} from "../shared/permissions";
import {
  BLOCK_PERM_APPROVE_JOIN,
  BLOCK_PERM_MANAGE_ROLE,
  BLOCK_PERM_DELETE,
} from "../shared/permissions";
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
 * 从加密归档文件加载板块数据
 *
 * 遍历最近 30 天的归档目录，找到匹配 ID 的归档文件后解密返回。
 * 使用 AbortController 设置 5 秒超时。
 */
async function loadBlockFromArchive(
  id: string,
  archiveEnv: ArchiveEnv
): Promise<ArchiveLoaderResult | null> {
  for (let daysAgo = 0; daysAgo <= 30; daysAgo++) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const archivePath = getArchivePath("block", id, dateStr);
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
 * 重放归档之后的热操作（板块仅支持 delete）
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

/** 板块信息 */
export interface BlockInfo {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isLocked: boolean;
  createdAt: string;
}

/** 板块成员信息 */
export interface BlockMemberInfo {
  id: string;
  blockId: string;
  userId: string;
  role: string;
  permissions: bigint;
  joinedAt: string;
}

/** 创建板块的输入参数 */
export interface CreateBlockData {
  name: string;
  description?: string | null;
  ownerId: string;
}

// ============================================================
//  内部辅助函数
// ============================================================

/**
 * 检查用户是否拥有板块级权限
 *
 * 优先检查全站 manage_block 权限（超级权限），
 * 否则检查板块成员权限位。
 */
async function hasBlockPermission(
  db: D1Database,
  blockId: string,
  userId: string,
  bitPosition: number
): Promise<boolean> {
  const member = await db
    .prepare("SELECT permissions FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first<{ permissions: number }>();

  if (!member) return false;

  const mask = 1n << BigInt(bitPosition);
  return (BigInt(member.permissions) & mask) === mask;
}

/** 检查用户是否为板块成员 */
async function isBlockMember(
  db: D1Database,
  blockId: string,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first();

  return !!row;
}

// ============================================================
//  查询函数
// ============================================================

/**
 * 创建板块
 *
 * 需要 manage_block 权限。创建者自动成为 ownerId。
 *
 * @returns 板块 ID，无权限返回 null
 */
export async function createBlock(
  db: D1Database,
  data: CreateBlockData,
  user: CurrentUser | null
): Promise<string | null> {
  if (!can(user, PERM_MANAGE_BLOCK)) return null;
  if (!user) return null;

  const id = generateUUID();
  const now = nowISO();

  await db
    .prepare(
      "INSERT INTO block (id, name, description, ownerId, createdAt) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, data.name, data.description ?? null, data.ownerId, now)
    .run();

  // 创建者自动成为板块成员（owner 角色）
  // 板块长初始权限全开（0-14 位全部置 1 = 32767）
  // 注：板块长在任期间权限不可变，由后续 Task 在 updateMemberPermissions 中增加保护
  const OWNER_PERMISSIONS = 32767; // (1n << 15n) - 1 = 15 位全开
  await db
    .prepare(
      "INSERT INTO block_member (id, blockId, userId, role, permissions, joinedAt) VALUES (?, ?, ?, 'owner', ?, ?)"
    )
    .bind(generateUUID(), id, data.ownerId, OWNER_PERMISSIONS, now)
    .run();

  return id;
}

/**
 * 获取板块信息（带归档回退）
 *
 * - isDeleted = 1 → null
 * - isLocked = 1 且非成员且无 manage_block → null
 * - D1 中不存在 → 尝试从归档文件加载
 */
export async function getBlockById(
  db: D1Database,
  id: string,
  user: CurrentUser | null,
  archiveEnv?: ArchiveEnv
): Promise<BlockInfo | null> {
  const row = await db
    .prepare("SELECT id, name, description, ownerId, isLocked, isDeleted, isArchived, createdAt FROM block WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      name: string;
      description: string | null;
      ownerId: string;
      isLocked: number;
      isDeleted: number;
      isArchived: number;
      createdAt: string;
    }>();

  // D1 中存在且未归档且未删除 → 正常路径
  if (row && !row.isArchived && !row.isDeleted) {
    // 锁定板块：非成员且无全站管理权限 → 404
    if (row.isLocked) {
      if (can(user, PERM_MANAGE_BLOCK)) {
        // 有全站权限，放行
      } else if (user && (await isBlockMember(db, id, user.id))) {
        // 是成员，放行
      } else {
        return null;
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      isLocked: !!row.isLocked,
      createdAt: row.createdAt,
    };
  }

  // D1 已归档 / 已删除 / 不存在 → 尝试从归档文件加载 + 热操作重放
  if (!archiveEnv) return null;

  const archiveData = await loadBlockFromArchive(id, archiveEnv);

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
    finalRow = await applyHotOperations(db, "block", id, finalRow, archiveTimestamp);
    if (!finalRow) return null;
  }

  const aRow = finalRow as unknown as {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
    isLocked: number;
    isDeleted: number;
    createdAt: string;
  };

  // 归档数据同样检查删除状态
  if (aRow.isDeleted) return null;

  return {
    id: aRow.id,
    name: aRow.name,
    description: aRow.description,
    ownerId: aRow.ownerId,
    isLocked: !!aRow.isLocked,
    createdAt: aRow.createdAt,
  };
}

/** 列出所有未删除的板块 */
export async function listBlocks(
  db: D1Database,
  _user: CurrentUser | null
): Promise<BlockInfo[]> {
  const rows = await db
    .prepare(
      "SELECT id, name, description, ownerId, isLocked, createdAt FROM block WHERE isDeleted = 0 ORDER BY createdAt DESC"
    )
    .all<{
      id: string;
      name: string;
      description: string | null;
      ownerId: string;
      isLocked: number;
      createdAt: string;
    }>();

  return rows.results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ownerId: r.ownerId,
    isLocked: !!r.isLocked,
    createdAt: r.createdAt,
  }));
}

/**
 * 申请加入板块
 *
 * 检查黑名单。插入 block_join_request。
 *
 * @returns false 表示在黑名单中或已有申请
 */
export async function joinRequest(
  db: D1Database,
  blockId: string,
  userId: string
): Promise<boolean> {
  // 检查黑名单
  const blacklisted = await db
    .prepare("SELECT id FROM block_blacklist WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first();

  if (blacklisted) return false;

  // 检查是否已是成员
  const isMember = await isBlockMember(db, blockId, userId);
  if (isMember) return false;

  const now = nowISO();

  try {
    await db
      .prepare(
        "INSERT INTO block_join_request (id, blockId, userId, status, createdAt) VALUES (?, ?, ?, 'pending', ?)"
      )
      .bind(generateUUID(), blockId, userId, now)
      .run();
  } catch (err) {
    // 仅捕获 UNIQUE 约束冲突（已有申请），其他错误向上抛出
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return false;
    }
    throw err;
  }

  return true;
}

/**
 * 审批加入申请
 *
 * 需要 block_approve_join 板块权限或 manage_block 全站权限。
 * 审批后自动插入 block_member。
 *
 * @returns false 表示无权限或申请不存在
 */
export async function approveJoin(
  db: D1Database,
  blockId: string,
  userId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  // 权限检查：全站 manage_block 或板块 approve_join
  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_APPROVE_JOIN));

  if (!hasBlockPerm) return false;

  // 查找申请
  const request = await db
    .prepare("SELECT id FROM block_join_request WHERE blockId = ? AND userId = ? AND status = 'pending'")
    .bind(blockId, userId)
    .first<{ id: string }>();

  if (!request) return false;

  const now = nowISO();

  // 更新申请状态
  await db
    .prepare("UPDATE block_join_request SET status = 'approved', reviewedBy = ?, reviewedAt = ? WHERE id = ?")
    .bind(user.id, now, request.id)
    .run();

  // 插入成员
  await db
    .prepare(
      "INSERT INTO block_member (id, blockId, userId, role, permissions, joinedAt) VALUES (?, ?, ?, 'member', 0, ?)"
    )
    .bind(generateUUID(), blockId, userId, now)
    .run();

  return true;
}

/**
 * 更新板块成员权限
 *
 * 需要 block_manage_role 板块权限。
 *
 * @returns false 表示无权限
 */
export async function updateMemberPermissions(
  db: D1Database,
  blockId: string,
  userId: string,
  permissions: bigint,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_ROLE));

  if (!hasBlockPerm) return false;

  const now = nowISO();

  await db
    .prepare("UPDATE block_member SET permissions = ? WHERE blockId = ? AND userId = ?")
    .bind(Number(permissions), blockId, userId)
    .run();

  return true;
}

/**
 * 锁定板块
 *
 * 需要 manage_block 权限。设置 isLocked = 1。
 *
 * @returns false 表示无权限或板块不存在
 */
export async function lockBlock(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!can(user, PERM_MANAGE_BLOCK)) return false;

  const exists = await db
    .prepare("SELECT id FROM block WHERE id = ? AND isDeleted = 0")
    .bind(id)
    .first();

  if (!exists) return false;

  await db
    .prepare("UPDATE block SET isLocked = 1 WHERE id = ?")
    .bind(id)
    .run();

  return true;
}

/**
 * 删除板块（软删除）
 *
 * 需要 block_delete 板块权限或 manage_block 全站权限。
 * 设置 isDeleted = 1，并在 archive_operation 记录。
 *
 * @returns false 表示无权限或板块不存在
 */
export async function deleteBlock(
  db: D1Database,
  id: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, id, user.id, BLOCK_PERM_DELETE));

  if (!hasBlockPerm) return false;

  const exists = await db
    .prepare("SELECT id FROM block WHERE id = ? AND isDeleted = 0")
    .bind(id)
    .first();

  if (!exists) return false;

  const now = nowISO();

  // 软删除
  await db
    .prepare("UPDATE block SET isDeleted = 1 WHERE id = ?")
    .bind(id)
    .run();

  // 记录到 archive_operation
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'block', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, now)
    .run();

  return true;
}

