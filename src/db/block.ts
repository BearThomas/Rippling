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
  BLOCK_PERM_VIEW,
  BLOCK_PERM_CREATE_POST,
  BLOCK_PERM_COMMENT,
  BLOCK_PERM_LIKE,
  BLOCK_PERM_EDIT_OWN_POST,
  BLOCK_PERM_DELETE_OWN_POST,
  BLOCK_PERM_UPLOAD_IMAGE,
  BLOCK_PERM_APPROVE_JOIN,
  BLOCK_PERM_MANAGE_MEMBER,
  BLOCK_PERM_MANAGE_ROLE,
  BLOCK_PERM_DELETE,
  BLOCK_PERM_TRANSFER,
} from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  板块权限常量
// ============================================================

/**
 * 板块长（owner）权限位 — 0-14 位全开
 *
 * (1n << 15n) - 1n = 32767。板块长在任期间权限不可修改。
 */
export const BLOCK_OWNER_PERMISSIONS = 32767;

/**
 * 默认成员（member）权限位
 *
 * view + create_post + comment + like + edit_own_post + delete_own_post + upload_image
 */
export const BLOCK_DEFAULT_MEMBER_PERMISSIONS =
  (1 << BLOCK_PERM_VIEW) |
  (1 << BLOCK_PERM_CREATE_POST) |
  (1 << BLOCK_PERM_COMMENT) |
  (1 << BLOCK_PERM_LIKE) |
  (1 << BLOCK_PERM_EDIT_OWN_POST) |
  (1 << BLOCK_PERM_DELETE_OWN_POST) |
  (1 << BLOCK_PERM_UPLOAD_IMAGE);

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

/** 板块信息（列表用） */
export interface BlockInfo {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isLocked: boolean;
  createdAt: string;
}

/** 板块详情（含当前用户成员信息） */
export interface BlockDetailInfo extends BlockInfo {
  /** 当前用户是否为成员 */
  isMember: boolean;
  /** 当前用户角色（owner/member），非成员为 null */
  myRole: string | null;
  /** 当前用户板块权限（BigInt 字符串），非成员为 null */
  myPermissions: string | null;
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

/** 板块加入申请信息 */
export interface JoinRequestInfo {
  id: string;
  userId: string;
  status: string;
  createdAt: string;
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

/** 检查用户是否为板块长（owner） */
async function isBlockOwner(
  db: D1Database,
  blockId: string,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM block_member WHERE blockId = ? AND userId = ? AND role = 'owner'")
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
  // 板块长在任期间权限不可变，由 updateMemberPermissions 保护
  await db
    .prepare(
      "INSERT INTO block_member (id, blockId, userId, role, permissions, joinedAt) VALUES (?, ?, ?, 'owner', ?, ?)"
    )
    .bind(generateUUID(), id, data.ownerId, BLOCK_OWNER_PERMISSIONS, now)
    .run();

  return id;
}

/**
 * 获取板块信息（带归档回退）
 *
 * - isDeleted = 1 → null
 * - isLocked = 1 且非成员且无 manage_block → null
 * - D1 中不存在 → 尝试从归档文件加载
 *
 * 返回 BlockDetailInfo，含当前用户是否为成员、角色、权限。
 */
export async function getBlockById(
  db: D1Database,
  id: string,
  user: CurrentUser | null,
  archiveEnv?: ArchiveEnv
): Promise<BlockDetailInfo | null> {
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

    const membership = await getMyMembership(db, id, user);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      isLocked: !!row.isLocked,
      createdAt: row.createdAt,
      isMember: membership.isMember,
      myRole: membership.myRole,
      myPermissions: membership.myPermissions,
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

  const membership = await getMyMembership(db, id, user);

  return {
    id: aRow.id,
    name: aRow.name,
    description: aRow.description,
    ownerId: aRow.ownerId,
    isLocked: !!aRow.isLocked,
    createdAt: aRow.createdAt,
    isMember: membership.isMember,
    myRole: membership.myRole,
    myPermissions: membership.myPermissions,
  };
}

/**
 * 查询当前用户在板块中的成员信息
 *
 * @returns isMember / myRole / myPermissions（BigInt 字符串）
 */
async function getMyMembership(
  db: D1Database,
  blockId: string,
  user: CurrentUser | null
): Promise<{ isMember: boolean; myRole: string | null; myPermissions: string | null }> {
  if (!user) return { isMember: false, myRole: null, myPermissions: null };

  const member = await db
    .prepare("SELECT role, permissions FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, user.id)
    .first<{ role: string; permissions: number }>();

  if (!member) return { isMember: false, myRole: null, myPermissions: null };

  return {
    isMember: true,
    myRole: member.role,
    myPermissions: BigInt(member.permissions).toString(),
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

  // 插入成员（默认成员权限）
  await db
    .prepare(
      "INSERT INTO block_member (id, blockId, userId, role, permissions, joinedAt) VALUES (?, ?, ?, 'member', ?, ?)"
    )
    .bind(generateUUID(), blockId, userId, BLOCK_DEFAULT_MEMBER_PERMISSIONS, now)
    .run();

  return true;
}

/**
 * 更新板块成员权限
 *
 * 需要 block_manage_role 板块权限或 manage_block 全站权限。
 * 禁止修改板块长（owner）的权限（owner 权限全开且不可变）。
 *
 * @returns false 表示无权限、目标不存在或目标是 owner
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

  // 禁止修改 owner 的权限
  const target = await db
    .prepare("SELECT role FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first<{ role: string }>();

  if (!target) return false;
  if (target.role === "owner") return false;

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
 * 解锁板块
 *
 * 需要 manage_block 权限。设置 isLocked = 0。
 *
 * @returns false 表示无权限或板块不存在
 */
export async function unlockBlock(
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
    .prepare("UPDATE block SET isLocked = 0 WHERE id = ?")
    .bind(id)
    .run();

  return true;
}

/**
 * 删除板块（软删除）
 *
 * 需要 block_delete 板块权限或 manage_block 全站权限。
 * 操作：
 *   1. 软删除板块内的所有帖子（isDeleted = 1）+ 每个帖子记录 archive_operation delete
 *   2. 软删除板块本身（isDeleted = 1）+ 记录 archive_operation delete
 *
 * 板块数据不物理删除，归档保留用于追责。
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

  // 1. 查找板块内所有未删除帖子
  const posts = await db
    .prepare("SELECT id FROM post WHERE blockId = ? AND isDeleted = 0")
    .bind(id)
    .all<{ id: string }>();

  // 2. 软删除每个帖子 + 记录操作链（批量）
  for (const post of posts.results) {
    await db
      .prepare("UPDATE post SET isDeleted = 1, updatedAt = ? WHERE id = ?")
      .bind(now, post.id)
      .run();

    await db
      .prepare(
        `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
         VALUES (?, 'post', ?, 'delete', ?, ?)`
      )
      .bind(generateUUID(), post.id, user.id, now)
      .run();
  }

  // 3. 软删除板块本身
  await db
    .prepare("UPDATE block SET isDeleted = 1 WHERE id = ?")
    .bind(id)
    .run();

  // 4. 记录板块删除操作
  await db
    .prepare(
      `INSERT INTO archive_operation (id, targetType, targetId, operation, operatedBy, createdAt)
       VALUES (?, 'block', ?, 'delete', ?, ?)`
    )
    .bind(generateUUID(), id, user.id, now)
    .run();

  return true;
}

// ============================================================
//  成员管理函数
// ============================================================

/**
 * 列出板块成员
 *
 * 需要 block_manage_member 板块权限、owner 或 manage_block 全站权限。
 *
 * @returns 成员列表；无权限返回 null
 */
export async function listBlockMembers(
  db: D1Database,
  blockId: string,
  user: CurrentUser | null
): Promise<BlockMemberInfo[] | null> {
  if (!user) return null;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const isOwner = await isBlockOwner(db, blockId, user.id);
  const hasBlockPerm = hasGlobalPerm || isOwner || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_MEMBER));

  if (!hasBlockPerm) return null;

  const rows = await db
    .prepare(
      "SELECT id, blockId, userId, role, permissions, joinedAt FROM block_member WHERE blockId = ? ORDER BY joinedAt ASC"
    )
    .bind(blockId)
    .all<{
      id: string;
      blockId: string;
      userId: string;
      role: string;
      permissions: number;
      joinedAt: string;
    }>();

  return rows.results.map((r) => ({
    id: r.id,
    blockId: r.blockId,
    userId: r.userId,
    role: r.role,
    permissions: BigInt(r.permissions),
    joinedAt: r.joinedAt,
  }));
}

/**
 * 移除板块成员
 *
 * 需要 block_manage_member 板块权限或 manage_block 全站权限。
 * 不能移除板块长（owner）。
 *
 * @returns false 表示无权限、目标不存在或目标是 owner
 */
export async function removeBlockMember(
  db: D1Database,
  blockId: string,
  userId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_MEMBER));

  if (!hasBlockPerm) return false;

  // 禁止移除 owner
  const target = await db
    .prepare("SELECT role FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first<{ role: string }>();

  if (!target) return false;
  if (target.role === "owner") return false;

  const result = await db
    .prepare("DELETE FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * 将用户加入板块黑名单
 *
 * 需要 block_manage_member 板块权限或 manage_block 全站权限。
 * 如果用户是成员，同时移除其成员身份。
 *
 * @returns false 表示无权限或已在黑名单
 */
export async function addToBlockBlacklist(
  db: D1Database,
  blockId: string,
  userId: string,
  reason: string | null,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_MEMBER));

  if (!hasBlockPerm) return false;

  // 禁止拉黑 owner
  if (await isBlockOwner(db, blockId, userId)) return false;

  // 检查是否已在黑名单
  const existing = await db
    .prepare("SELECT id FROM block_blacklist WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first();
  if (existing) return false;

  const now = nowISO();

  // 如果是成员，移除成员身份
  await db
    .prepare("DELETE FROM block_member WHERE blockId = ? AND userId = ? AND role != 'owner'")
    .bind(blockId, userId)
    .run();

  await db
    .prepare(
      "INSERT INTO block_blacklist (id, blockId, userId, reason, createdAt) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(generateUUID(), blockId, userId, reason, now)
    .run();

  return true;
}

/**
 * 将用户移出板块黑名单
 *
 * 需要 block_manage_member 板块权限或 manage_block 全站权限。
 *
 * @returns false 表示无权限或不在黑名单
 */
export async function removeFromBlockBlacklist(
  db: D1Database,
  blockId: string,
  userId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_MEMBER));

  if (!hasBlockPerm) return false;

  const result = await db
    .prepare("DELETE FROM block_blacklist WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * 转让板块所有权
 *
 * 仅 owner 本人可操作。转让后：
 *   - 原 owner 角色变为 member，权限重置为默认成员权限
 *   - 新 owner 角色变为 owner，权限设为全开
 *
 * @returns false 表示非 owner、目标不存在或目标已在板块
 */
export async function transferBlockOwnership(
  db: D1Database,
  blockId: string,
  newOwnerId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  // 仅 owner 本人可转让
  if (!(await isBlockOwner(db, blockId, user.id))) return false;

  // 不能转让给自己
  if (newOwnerId === user.id) return false;

  // 板块必须存在且未删除
  const block = await db
    .prepare("SELECT id FROM block WHERE id = ? AND isDeleted = 0")
    .bind(blockId)
    .first();
  if (!block) return false;

  const now = nowISO();

  // 检查新 owner 是否已是成员
  const existingMember = await db
    .prepare("SELECT id, role FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, newOwnerId)
    .first<{ id: string; role: string }>();

  if (existingMember) {
    // 已是成员 → 提升为 owner
    await db
      .prepare("UPDATE block_member SET role = 'owner', permissions = ? WHERE blockId = ? AND userId = ?")
      .bind(BLOCK_OWNER_PERMISSIONS, blockId, newOwnerId)
      .run();
  } else {
    // 非成员 → 新增为 owner
    await db
      .prepare(
        "INSERT INTO block_member (id, blockId, userId, role, permissions, joinedAt) VALUES (?, ?, ?, 'owner', ?, ?)"
      )
      .bind(generateUUID(), blockId, newOwnerId, BLOCK_OWNER_PERMISSIONS, now)
      .run();
  }

  // 原 owner 降级为 member，权限重置为默认
  await db
    .prepare("UPDATE block_member SET role = 'member', permissions = ? WHERE blockId = ? AND userId = ?")
    .bind(BLOCK_DEFAULT_MEMBER_PERMISSIONS, blockId, user.id)
    .run();

  // 更新板块 ownerId
  await db
    .prepare("UPDATE block SET ownerId = ? WHERE id = ?")
    .bind(newOwnerId, blockId)
    .run();

  return true;
}

/**
 * 退出板块
 *
 * 普通成员可退出；owner 不可直接退出（需先转让）。
 *
 * @returns false 表示不是成员或 owner
 */
export async function leaveBlock(
  db: D1Database,
  blockId: string,
  userId: string
): Promise<boolean> {
  const member = await db
    .prepare("SELECT role FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .first<{ role: string }>();

  if (!member) return false;
  if (member.role === "owner") return false;

  const result = await db
    .prepare("DELETE FROM block_member WHERE blockId = ? AND userId = ?")
    .bind(blockId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ============================================================
//  加入申请管理
// ============================================================

/**
 * 获取板块待审核的加入申请
 *
 * 需要 block_approve_join 板块权限或 manage_block 全站权限。
 *
 * @returns 待审核申请列表；无权限返回 null
 */
export async function getBlockJoinRequests(
  db: D1Database,
  blockId: string,
  user: CurrentUser | null
): Promise<JoinRequestInfo[] | null> {
  if (!user) return null;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_APPROVE_JOIN));

  if (!hasBlockPerm) return null;

  const rows = await db
    .prepare(
      "SELECT id, userId, status, createdAt FROM block_join_request WHERE blockId = ? AND status = 'pending' ORDER BY createdAt ASC"
    )
    .bind(blockId)
    .all<{ id: string; userId: string; status: string; createdAt: string }>();

  return rows.results.map((r) => ({
    id: r.id,
    userId: r.userId,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

/**
 * 拒绝加入申请
 *
 * 需要 block_approve_join 板块权限或 manage_block 全站权限。
 *
 * @returns false 表示无权限或申请不存在
 */
export async function rejectJoinRequest(
  db: D1Database,
  blockId: string,
  userId: string,
  user: CurrentUser | null
): Promise<boolean> {
  if (!user) return false;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const hasBlockPerm = hasGlobalPerm || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_APPROVE_JOIN));

  if (!hasBlockPerm) return false;

  const request = await db
    .prepare("SELECT id FROM block_join_request WHERE blockId = ? AND userId = ? AND status = 'pending'")
    .bind(blockId, userId)
    .first<{ id: string }>();

  if (!request) return false;

  const now = nowISO();

  await db
    .prepare("UPDATE block_join_request SET status = 'rejected', reviewedBy = ?, reviewedAt = ? WHERE id = ?")
    .bind(user.id, now, request.id)
    .run();

  return true;
}

/** 板块黑名单信息 */
export interface BlockBlacklistInfo {
  id: string;
  userId: string;
  reason: string | null;
  createdAt: string;
}

/**
 * 列出板块黑名单
 *
 * 需要 block_manage_member 板块权限、owner 或 manage_block 全站权限。
 *
 * @returns 黑名单列表；无权限时返回 null
 */
export async function listBlockBlacklist(
  db: D1Database,
  blockId: string,
  user: CurrentUser | null
): Promise<BlockBlacklistInfo[] | null> {
  if (!user) return null;

  const hasGlobalPerm = can(user, PERM_MANAGE_BLOCK);
  const isOwner = await isBlockOwner(db, blockId, user.id);
  const hasBlockPerm =
    hasGlobalPerm || isOwner || (await hasBlockPermission(db, blockId, user.id, BLOCK_PERM_MANAGE_MEMBER));

  if (!hasBlockPerm) return null;

  const rows = await db
    .prepare(
      "SELECT id, userId, reason, createdAt FROM block_blacklist WHERE blockId = ? ORDER BY createdAt DESC"
    )
    .bind(blockId)
    .all<{ id: string; userId: string; reason: string | null; createdAt: string }>();

  return rows.results.map((r) => ({
    id: r.id,
    userId: r.userId,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}

/**
 * 列出当前用户已加入的板块（我的板块）
 *
 * 通过 block_member 关联 block 表，仅返回未删除板块。
 * 未登录返回空数组。
 */
export async function listMyBlocks(
  db: D1Database,
  user: CurrentUser | null
): Promise<BlockInfo[]> {
  if (!user) return [];

  const rows = await db
    .prepare(
      "SELECT b.id, b.name, b.description, b.ownerId, b.isLocked, b.createdAt " +
        "FROM block_member m JOIN block b ON m.blockId = b.id " +
        "WHERE m.userId = ? AND b.isDeleted = 0 ORDER BY m.joinedAt DESC"
    )
    .bind(user.id)
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
 * 列出当前用户待审核的加入申请所属板块 ID 列表
 *
 * 用于前端列表页展示"已申请 / 审核中"状态，避免重复申请。
 */
export async function listMyPendingJoinRequests(
  db: D1Database,
  userId: string
): Promise<string[]> {
  const rows = await db
    .prepare("SELECT blockId FROM block_join_request WHERE userId = ? AND status = 'pending'")
    .bind(userId)
    .all<{ blockId: string }>();

  return rows.results.map((r) => r.blockId);
}

