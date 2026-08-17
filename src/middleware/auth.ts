/**
 * 认证中间件
 *
 * 职责：
 *   1. 调用 Better Auth 的 getSession 验证请求 Cookie
 *   2. 验证成功后从 user_profile 表读取权限掩码
 *   3. 将 user 信息（id, permissions）设置到 context
 *   4. 验证失败或未登录，设置 user = null
 */

import { createMiddleware } from "hono/factory";
import type { CloudflareEnv } from "../auth";
import { createAuth } from "../auth";

/** 认证用户信息（挂载到 context 上） */
export interface AuthUser {
  /** 用户 ID（Better Auth user.id） */
  id: string;
  /** 权限掩码（从 user_profile.permissions 读取） */
  permissions: bigint;
}

/** Hono context 变量类型 */
export interface AppContextVars {
  user: AuthUser | null;
  deviceId: string | null;
}

/**
 * 认证中间件
 *
 * 调用 Better Auth getSession 验证 Cookie，
 * 然后从 D1 读取 user_profile.permissions。
 */
export const authMiddleware = createMiddleware<{
  Variables: AppContextVars;
  Bindings: CloudflareEnv;
}>(async (c, next) => {
  const auth = createAuth(c.env);

  // 调用 Better Auth 验证 session（自动从 Cookie 读取 token）
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!sessionData?.user?.id) {
    c.set("user", null);
    await next();
    return;
  }

  // 从 user_profile 表读取权限掩码 + 注销状态
  const profile = await c.env.DB
    .prepare("SELECT permissions, isDeactivated FROM user_profile WHERE userId = ?")
    .bind(sessionData.user.id)
    .first<{ permissions: number; isDeactivated: number | null }>();

  if (!profile) {
    // 理论上不应发生（注册时已创建 profile），安全降级
    console.warn(
      `[Auth] user_profile not found for userId=${sessionData.user.id}, falling back to null`
    );
    c.set("user", null);
    await next();
    return;
  }

  // 已注销账号无法登录（账号注销工单批准后 isDeactivated = 1）
  if (profile.isDeactivated) {
    c.set("user", null);
    await next();
    return;
  }

  c.set("user", {
    id: sessionData.user.id,
    permissions: BigInt(profile.permissions),
  });

  await next();
});
