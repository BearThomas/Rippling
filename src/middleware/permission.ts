/**
 * 权限检查中间件
 *
 * 职责：
 *   1. 从 context 读取 user（由 authMiddleware 设置）
 *   2. 检查 user.permissions 是否包含指定的权限位
 *   3. 不满足条件时返回统一错误响应
 *
 * TODO: Task 19 会完善权限继承和角色逻辑（板块权限合并、角色叠加等）。
 */

import type { Context, MiddlewareHandler } from "hono";
import type { AppContextVars } from "./auth";
import { hasPermission } from "../shared/permissions";
import { UNAUTHORIZED, FORBIDDEN } from "../utils/errors";

/**
 * 创建权限检查中间件
 *
 * @param permissionBit - 权限位位置（0-37），会自动转换为掩码进行位运算
 * @returns Hono 中间件
 *
 * @example
 *   app.post("/api/posts", requirePermission(1), createPostHandler);
 *   // permissionBit = 1 → mask = 1n << 1n = 2n
 */
export function requirePermission(permissionBit: number): MiddlewareHandler<{
  Variables: AppContextVars;
}> {
  const mask = 1n << BigInt(permissionBit);

  return async (c: Context<{ Variables: AppContextVars }>, next) => {
    const user = c.get("user");

    // 未登录
    if (!user) {
      return c.json(
        { success: false, error: { code: UNAUTHORIZED.code, message: UNAUTHORIZED.message } },
        UNAUTHORIZED.statusCode as any
      );
    }

    // 权限不足
    if (!hasPermission(user.permissions, mask)) {
      return c.json(
        { success: false, error: { code: FORBIDDEN.code, message: FORBIDDEN.message } },
        FORBIDDEN.statusCode as any
      );
    }

    await next();
  };
}
