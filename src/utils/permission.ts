/**
 * 权限检查工具（DAL 层专用）
 *
 * 封装 CurrentUser 类型和权限检查函数，供所有 DAL 模块使用。
 * 底层位运算委托给 shared/permissions.ts 的 hasPermission。
 */

import { hasPermission as _hasPermission } from "../shared/permissions";

/** DAL 函数使用的当前用户信息 */
export interface CurrentUser {
  /** 用户 ID */
  id: string;
  /** 权限掩码（BigInt，从 user_profile.permissions 转换） */
  permissions: bigint;
}

/**
 * 检查用户是否拥有指定权限位
 *
 * @param user - 当前用户（null 表示未登录）
 * @param bit  - 权限位位置（如 PERM_VIEW_ANONYMOUS_IDENTITY）
 * @returns 用户为 null 或缺少该权限时返回 false
 */
export function can(user: CurrentUser | null, bit: number): boolean {
  if (!user) return false;
  return _hasPermission(user.permissions, 1n << BigInt(bit));
}
