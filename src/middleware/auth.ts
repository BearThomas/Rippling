/**
 * 认证中间件（占位）
 *
 * 职责：
 *   1. 从请求 Cookie 中读取 session token
 *   2. 验证 session 并设置 context.user
 *
 * 当前状态：占位实现
 *   - token 不存在 → user = null
 *   - token 存在 → user = null（占位）
 *
 * TODO: Task 4 会接入 Better Auth，根据 token 查询 session 并填充 user 信息。
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

/** 认证用户信息（挂载到 context 上） */
export interface AuthUser {
  /** 用户 ID */
  id: string;
  /** 权限掩码（BigInt 存储为 string，从数据库读取后转换） */
  permissions: bigint;
}

/** Hono context 变量类型 */
export interface AppContextVars {
  user: AuthUser | null;
  deviceId: string | null;
}

/** Cookie 中 session token 的 key 名称 */
const SESSION_COOKIE = "session_token";

/**
 * 认证中间件
 *
 * 从 Cookie 读取 session token，后续 Task 4 会调用 Better Auth 验证。
 */
export const authMiddleware = createMiddleware<{
  Variables: AppContextVars;
}>(async (c, next) => {
  // 从 Cookie 中读取 session token
  const token = getCookie(c, SESSION_COOKIE) ?? null;

  if (!token) {
    // 未携带 token，视为游客
    c.set("user", null);
    await next();
    return;
  }

  // TODO: Task 4 — 调用 Better Auth 验证 session token
  // const session = await betterAuth.api.getSession({ headers: c.req.raw.headers });
  // if (session?.user) {
  //   c.set("user", { id: session.user.id, permissions: BigInt(session.user.permissions) });
  // } else {
  //   c.set("user", null);
  // }

  // 占位：token 存在但尚未验证，暂时设为 null
  c.set("user", null);

  await next();
});
