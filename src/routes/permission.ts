/**
 * 权限查询 API 路由
 *
 * 路由表（挂载前缀 /api/permissions）：
 *   GET /me   查询当前用户自己的权限掩码（无需任何权限位）
 *
 * 设计说明：
 *   - 前端需要在页面中判断位权限（如 pin_post、create_vote），
 *     但 Cookie 里的 session 不含 permissions，且 BigInt 无法
 *     直接 JSON 序列化 → 以十进制字符串形式返回。
 *   - 本接口只返回「自己看自己」的权限，不做任何权限检查；
 *     未登录也返回成功（permissions 为 "0"），便于前端统一处理。
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";

// ============================================================
//  类型定义
// ============================================================

type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

const permissionRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /me  — 查询当前用户自己的权限掩码
// ------------------------------------------------------------

permissionRoutes.get("/me", async (c) => {
  const user = c.get("user");

  // 未登录 / session 无效：返回零权限，前端按游客处理
  if (!user) {
    return c.json({
      success: true,
      data: { permissions: "0", user: null },
    });
  }

  // BigInt 无法 JSON 序列化，统一转为十进制字符串
  const permissions = user.permissions.toString();

  return c.json({
    success: true,
    data: {
      permissions,
      user: { id: user.id, permissions },
    },
  });
});

export default permissionRoutes;
