/**
 * 板块管理 API 路由
 *
 * 路由表（挂载前缀 /api/block）：
 *   GET    /list              板块列表（公开，标记 isLocked）
 *   GET    /                  板块详情（含当前用户成员信息）
 *   POST   /                  创建板块（manage_block）
 *   POST   /join              申请加入（登录）
 *   GET    /requests          待审核申请列表（block_approve_join）
 *   POST   /approve           通过申请（block_approve_join）
 *   POST   /reject            拒绝申请（block_approve_join）
 *   GET    /members           成员列表（block_manage_member）
 *   POST   /member/remove     移除成员（block_manage_member）
 *   POST   /member/permissions 修改成员权限（block_manage_role）
 *   POST   /blacklist/add     加入黑名单（block_manage_member）
 *   POST   /blacklist/remove  移出黑名单（block_manage_member）
 *   POST   /transfer          转让板块（仅 owner）
 *   POST   /leave             退出板块（成员）
 *   POST   /lock              锁定板块（manage_block）
 *   POST   /unlock            解锁板块（manage_block）
 *   DELETE /                  删除板块（block_delete 或 manage_block）
 *   GET    /posts             板块帖子流（板块可见性由 DAL 检查）
 *   GET    /blacklist         黑名单列表（block_manage_member）
 *   GET    /my                我的板块列表（登录）
 *   GET    /my-requests       我的待审申请板块 ID 列表（登录）
 *
 * 权限模型：
 *   - 全站权限（manage_block）用 requirePermission 拦截
 *   - 板块级权限由 DAL 内部检查，失败返回 false/null → 404（零信任）
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  getBlockById,
  listBlocks,
  createBlock,
  joinRequest,
  approveJoin,
  rejectJoinRequest,
  getBlockJoinRequests,
  listBlockMembers,
  removeBlockMember,
  updateMemberPermissions,
  addToBlockBlacklist,
  removeFromBlockBlacklist,
  listBlockBlacklist,
  listMyBlocks,
  listMyPendingJoinRequests,
  transferBlockOwnership,
  leaveBlock,
  lockBlock,
  unlockBlock,
  deleteBlock,
  listBlockPosts,
  enrichPosts,
} from "../db";
import type { ArchiveEnv } from "../utils/archive";
import { PERM_MANAGE_BLOCK } from "../shared/permissions";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
} from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 板块路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

// ============================================================
//  辅助函数
// ============================================================

/**
 * 批量解析用户名（避免 N+1 查询）
 *
 * @returns userId → username 映射
 */
async function resolveUsernames(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();

  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT userId, username FROM user_profile WHERE userId IN (${placeholders})`)
    .bind(...userIds)
    .all<{ userId: string; username: string }>();

  return new Map(rows.results.map((r) => [r.userId, r.username]));
}

/** 统一的 404 响应 */
function notFound(c: any): Response {
  return c.json(
    { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
    NOT_FOUND.statusCode as any
  );
}

/** 统一的 400 响应 */
function badRequest(c: any, message: string): Response {
  return c.json(
    { success: false, error: { code: VALIDATION_ERROR.code, message } },
    VALIDATION_ERROR.statusCode as any
  );
}

/**
 * 解析分页参数（limit 默认 20，最大 50；offset 默认 0）
 */
function parsePagination(c: Context<E>): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 50);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

// ============================================================
//  路由实例
// ============================================================

const blockRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /list  — 板块列表（公开）
// ------------------------------------------------------------

blockRoutes.get("/list", async (c) => {
  const user = c.get("user");
  const blocks = await listBlocks(c.env.DB, user);
  return c.json({ success: true, data: blocks });
});

// ------------------------------------------------------------
//  GET /  — 板块详情（含当前用户成员信息）
// ------------------------------------------------------------

blockRoutes.get("/", async (c) => {
  const id = c.req.query("id");
  if (!id) return badRequest(c, "缺少 id 参数");

  const user = c.get("user");
  const archiveEnv: ArchiveEnv = {
    ENCRYPTION_KEY: c.env.ENCRYPTION_KEY ?? "",
    SITE_URL: new URL(c.req.url).origin,
  };

  const block = await getBlockById(c.env.DB, id, user, archiveEnv);
  if (!block) return notFound(c);

  return c.json({ success: true, data: block });
});

// ------------------------------------------------------------
//  POST /  — 创建板块（manage_block）
// ------------------------------------------------------------

blockRoutes.post("/", requirePermission(PERM_MANAGE_BLOCK), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const name = (body.name as string)?.trim();
  const description = (body.description as string) ?? null;

  if (!name) return badRequest(c, "缺少板块名称");

  const id = await createBlock(c.env.DB, { name, description, ownerId: user.id }, user);
  if (!id) return notFound(c);

  return c.json({ success: true, data: { id } });
});

// ------------------------------------------------------------
//  POST /join  — 申请加入（登录）
// ------------------------------------------------------------

blockRoutes.post("/join", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  if (!blockId) return badRequest(c, "缺少 blockId");

  const ok = await joinRequest(c.env.DB, blockId, user.id);
  if (!ok) return notFound(c); // 黑名单 / 已是成员 / 已有申请

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  GET /requests  — 待审核申请列表（block_approve_join）
// ------------------------------------------------------------

blockRoutes.get("/requests", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  const blockId = c.req.query("blockId");
  if (!blockId) return badRequest(c, "缺少 blockId");

  const requests = await getBlockJoinRequests(c.env.DB, blockId, user);
  if (!requests) return notFound(c); // 无权限

  // 批量解析申请者用户名
  const userIds = requests.map((r) => r.userId);
  const nameMap = await resolveUsernames(c.env.DB, userIds);
  const data = requests.map((r) => ({
    ...r,
    username: nameMap.get(r.userId) ?? null,
  }));

  return c.json({ success: true, data });
});

// ------------------------------------------------------------
//  POST /approve  — 通过申请（block_approve_join）
// ------------------------------------------------------------

blockRoutes.post("/approve", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");

  const ok = await approveJoin(c.env.DB, blockId, userId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /reject  — 拒绝申请（block_approve_join）
// ------------------------------------------------------------

blockRoutes.post("/reject", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");

  const ok = await rejectJoinRequest(c.env.DB, blockId, userId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  GET /members  — 成员列表（block_manage_member）
// ------------------------------------------------------------

blockRoutes.get("/members", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  const blockId = c.req.query("blockId");
  if (!blockId) return badRequest(c, "缺少 blockId");

  const members = await listBlockMembers(c.env.DB, blockId, user);
  if (!members) return notFound(c); // 无权限

  // 批量解析成员用户名
  const userIds = members.map((m) => m.userId);
  const nameMap = await resolveUsernames(c.env.DB, userIds);
  const data = members.map((m) => ({
    userId: m.userId,
    username: nameMap.get(m.userId) ?? null,
    role: m.role,
    permissions: m.permissions.toString(),
    joinedAt: m.joinedAt,
  }));

  return c.json({ success: true, data });
});

// ------------------------------------------------------------
//  POST /member/remove  — 移除成员（block_manage_member）
// ------------------------------------------------------------

blockRoutes.post("/member/remove", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");

  const ok = await removeBlockMember(c.env.DB, blockId, userId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /member/permissions  — 修改成员权限（block_manage_role）
// ------------------------------------------------------------

blockRoutes.post("/member/permissions", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  const permissionsRaw = body.permissions;

  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");
  if (permissionsRaw === undefined || permissionsRaw === null) {
    return badRequest(c, "缺少 permissions");
  }

  // permissions 支持数字或字符串（BigInt）
  let permissions: bigint;
  try {
    permissions = typeof permissionsRaw === "string"
      ? BigInt(permissionsRaw)
      : BigInt(permissionsRaw as number);
  } catch {
    return badRequest(c, "permissions 格式错误");
  }

  const ok = await updateMemberPermissions(c.env.DB, blockId, userId, permissions, user);
  if (!ok) return notFound(c); // 无权限 / 目标是 owner / 目标不存在

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /blacklist/add  — 加入黑名单（block_manage_member）
// ------------------------------------------------------------

blockRoutes.post("/blacklist/add", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  const reason = (body.reason as string) ?? null;
  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");

  const ok = await addToBlockBlacklist(c.env.DB, blockId, userId, reason, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /blacklist/remove  — 移出黑名单（block_manage_member）
// ------------------------------------------------------------

blockRoutes.post("/blacklist/remove", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const userId = body.userId as string;
  if (!blockId || !userId) return badRequest(c, "缺少 blockId 或 userId");

  const ok = await removeFromBlockBlacklist(c.env.DB, blockId, userId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /transfer  — 转让板块（仅 owner）
// ------------------------------------------------------------

blockRoutes.post("/transfer", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  const newOwnerId = body.newOwnerId as string;
  if (!blockId || !newOwnerId) return badRequest(c, "缺少 blockId 或 newOwnerId");

  const ok = await transferBlockOwnership(c.env.DB, blockId, newOwnerId, user);
  if (!ok) return notFound(c); // 非 owner / 目标无效

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /leave  — 退出板块（成员）
// ------------------------------------------------------------

blockRoutes.post("/leave", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  if (!blockId) return badRequest(c, "缺少 blockId");

  const ok = await leaveBlock(c.env.DB, blockId, user.id);
  if (!ok) return notFound(c); // 非成员 / owner 不可直接退出

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /lock  — 锁定板块（manage_block）
// ------------------------------------------------------------

blockRoutes.post("/lock", requirePermission(PERM_MANAGE_BLOCK), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  if (!blockId) return badRequest(c, "缺少 blockId");

  const ok = await lockBlock(c.env.DB, blockId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  POST /unlock  — 解锁板块（manage_block）
// ------------------------------------------------------------

blockRoutes.post("/unlock", requirePermission(PERM_MANAGE_BLOCK), async (c) => {
  const user = c.get("user")!;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return badRequest(c, "请求体格式错误");
  }

  const blockId = body.blockId as string;
  if (!blockId) return badRequest(c, "缺少 blockId");

  const ok = await unlockBlock(c.env.DB, blockId, user);
  if (!ok) return notFound(c);

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  DELETE /  — 删除板块（block_delete 或 manage_block）
// ------------------------------------------------------------

blockRoutes.delete("/", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  const blockId = c.req.query("blockId");
  if (!blockId) return badRequest(c, "缺少 blockId");

  const ok = await deleteBlock(c.env.DB, blockId, user);
  if (!ok) return notFound(c); // 无权限 / 板块不存在

  return c.json({ success: true });
});

// ------------------------------------------------------------
//  GET /posts  — 板块帖子流（板块可见性由 DAL 检查）
// ------------------------------------------------------------

blockRoutes.get("/posts", async (c) => {
  const blockId = c.req.query("blockId");
  if (!blockId) return badRequest(c, "缺少 blockId");

  const { limit, offset } = parsePagination(c);
  const posts = await listBlockPosts(c.env.DB, blockId, c.get("user"), limit, offset);
  if (!posts) return notFound(c); // 板块不存在 / 锁定且非成员

  // 附加作者信息 / 点赞数 / 评论数 / liked（批量查询，无 N+1）
  const enriched = await enrichPosts(c.env.DB, posts, c.get("user"));

  return c.json({ success: true, data: { posts: enriched, total: enriched.length } });
});

// ------------------------------------------------------------
//  GET /blacklist  — 黑名单列表（block_manage_member）
// ------------------------------------------------------------

blockRoutes.get("/blacklist", async (c) => {
  const user = c.get("user");
  if (!user) return notFound(c);

  const blockId = c.req.query("blockId");
  if (!blockId) return badRequest(c, "缺少 blockId");

  const list = await listBlockBlacklist(c.env.DB, blockId, user);
  if (!list) return notFound(c); // 无权限

  // 批量解析被拉黑用户用户名
  const nameMap = await resolveUsernames(c.env.DB, list.map((r) => r.userId));
  const data = list.map((r) => ({
    ...r,
    username: nameMap.get(r.userId) ?? null,
  }));

  return c.json({ success: true, data });
});

// ------------------------------------------------------------
//  GET /my  — 我的板块列表（登录）
// ------------------------------------------------------------

blockRoutes.get("/my", async (c) => {
  const user = c.get("user");
  const blocks = await listMyBlocks(c.env.DB, user);
  return c.json({ success: true, data: blocks });
});

// ------------------------------------------------------------
//  GET /my-requests  — 我的待审申请板块 ID 列表（登录）
// ------------------------------------------------------------

blockRoutes.get("/my-requests", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: true, data: [] });

  const blockIds = await listMyPendingJoinRequests(c.env.DB, user.id);
  return c.json({ success: true, data: blockIds });
});

export default blockRoutes;
