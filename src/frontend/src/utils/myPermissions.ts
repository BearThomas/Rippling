/**
 * 当前用户权限获取工具
 *
 * 通过公开接口 GET /api/permissions/me 获取自己的权限掩码：
 *   - 登录用户 → 后端返回十进制权限字符串
 *   - 未登录   → 后端返回 "0"
 *   - 网络失败 → 前端按 "0" 兜底，不阻塞页面渲染
 *
 * 权限判断请使用 utils/permission.ts 的 hasPermission(mask, bit)。
 * 结果带缓存与并发去重，登录 / 登出后须调用 clearPermissionCache()。
 */

import { apiGet } from "../api/client";

/** GET /api/permissions/me 响应 data 结构 */
interface MyPermissionsData {
  /** 权限掩码十进制字符串（BigInt 序列化形式） */
  permissions: string;
  /** 登录用户信息；未登录为 null */
  user: { id: string; permissions: string } | null;
}

/** 缓存：权限位掩码十进制字符串（null = 未获取过） */
let cachedPermissions: string | null = null;
/** 进行中的请求（并发去重） */
let fetchPromise: Promise<string> | null = null;

/**
 * 获取当前用户权限（带缓存与并发去重）
 *
 * @returns 权限位掩码十进制字符串；未登录或失败时返回 "0"
 */
export async function getMyPermissions(): Promise<string> {
  if (cachedPermissions !== null) return cachedPermissions;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      // 由后端依据 Cookie session 判定身份，静默模式不弹 Toast
      const data = await apiGet<MyPermissionsData>("/api/permissions/me", {
        silentError: true,
      });
      cachedPermissions = data.permissions ?? "0";
    } catch {
      // 网络失败等异常 → 按无权限处理，避免反复重试阻塞 UI
      cachedPermissions = "0";
    }
    return cachedPermissions;
  })();

  const result = await fetchPromise;
  fetchPromise = null;
  return result;
}

/** 清空缓存（登录 / 登出后调用） */
export function clearPermissionCache(): void {
  cachedPermissions = null;
  fetchPromise = null;
}
