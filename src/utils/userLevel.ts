/**
 * 用户等级与名称颜色计算工具
 *
 * 背景：
 *   user_profile.nameColor 不再作为展示颜色的唯一来源，
 *   所有返回 nameColor 的接口统一按「用户等级」动态计算：
 *     superadmin > admin > owner > verified > active > normal
 *
 * 等级判断规则（当前版本）：
 *   - superadmin：permissions 等于全部权限掩码（0-37 位全 1，即 274877906943）
 *   - admin：拥有 access_admin_panel 权限
 *   - owner：板块内 owner（单次用户信息查询无法判断时由调用方传入标记）
 *   - verified：拥有 submit_timeline 权限
 *   - active：暂不自动判断（后续接分数系统），先回退 normal
 *   - normal：上述都不满足
 *
 * 颜色配置来源（优先级从高到低）：
 *   D1 site_config.nameColors > 静态 config/site.config.json 的 nameColors > 内置默认色
 */

import { MASK_ACCESS_ADMIN_PANEL, MASK_SUBMIT_TIMELINE, hasPermission } from "../shared/permissions";
import { getSiteConfig } from "../db/siteConfig";
import staticConfig from "../config/site.config.json";

// ============================================================
//  类型与常量
// ============================================================

/** 用户等级 key */
export type UserLevel =
  | "normal"
  | "active"
  | "verified"
  | "admin"
  | "owner"
  | "superadmin";

/** 等级元信息（顺序即管理面板展示顺序） */
export const USER_LEVELS: ReadonlyArray<{ key: UserLevel; label: string }> = [
  { key: "normal", label: "普通用户" },
  { key: "active", label: "活跃用户" },
  { key: "verified", label: "认证用户" },
  { key: "admin", label: "管理员" },
  { key: "owner", label: "板块长" },
  { key: "superadmin", label: "站长/超级管理员" },
];

/** 全部权限掩码：权限位 0-37 全为 1（十进制 274877906943） */
export const ALL_PERMISSIONS_MASK = (1n << 38n) - 1n;

/** 内置默认等级颜色（站点未配置时的兜底） */
export const DEFAULT_NAME_COLORS: Record<UserLevel, string> = {
  normal: "#64748B",
  active: "#10B981",
  verified: "#3B82F6",
  admin: "#F59E0B",
  owner: "#8B5CF6",
  superadmin: "#EF4444",
};

/** getUserLevel 的输入 */
export interface UserLevelInput {
  /** 用户权限掩码 */
  permissions: bigint;
  /** 是否板块内 owner（单次用户信息查询无法判断时可省略） */
  isBlockOwner?: boolean;
}

// ============================================================
//  等级计算
// ============================================================

/**
 * 计算用户等级
 *
 * 判定顺序：superadmin → admin → owner → verified → normal。
 * active 暂不自动判断（待接入活跃度分数系统），回退 normal。
 */
export function getUserLevel(input: UserLevelInput): UserLevel {
  const { permissions } = input;

  // 超级管理员：全部权限位为 1
  if (permissions === ALL_PERMISSIONS_MASK) return "superadmin";

  // 管理员：拥有进入管理面板权限
  if (hasPermission(permissions, MASK_ACCESS_ADMIN_PANEL)) return "admin";

  // 板块长：由调用方传入标记（列表场景可批量判断）
  if (input.isBlockOwner) return "owner";

  // 认证用户：拥有提交大事记权限
  if (hasPermission(permissions, MASK_SUBMIT_TIMELINE)) return "verified";

  // 活跃用户：暂未接入分数系统，回退普通用户颜色
  return "normal";
}

// ============================================================
//  颜色解析
// ============================================================

/** 等级颜色配置（各等级可缺省，缺省时用默认色） */
export type NameColorPalette = Partial<Record<UserLevel, string>>;

/**
 * 加载等级颜色配置
 *
 * 优先级：D1 site_config.nameColors > 静态 site.config.json > 内置默认色。
 * 每次请求级调用一次后复用，避免重复查询。
 */
export async function loadNameColors(db: D1Database): Promise<Record<UserLevel, string>> {
  const config = await getSiteConfig(db).catch(() => null);

  return {
    ...DEFAULT_NAME_COLORS,
    ...(staticConfig.nameColors ?? {}),
    ...(config?.nameColors ?? {}),
  };
}

/**
 * 计算用户名颜色
 *
 * @param permissions 用户权限掩码
 * @param palette     等级颜色配置（loadNameColors 的结果）
 * @param isBlockOwner 是否板块内 owner（可选）
 * @returns 展示用的 nameColor（永不为 null）
 */
export function computeNameColor(
  permissions: bigint,
  palette: Record<UserLevel, string>,
  isBlockOwner?: boolean
): string {
  const level = getUserLevel({ permissions, isBlockOwner });
  return palette[level] ?? DEFAULT_NAME_COLORS[level];
}
