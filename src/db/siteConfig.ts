/**
 * 站点配置数据访问层
 *
 * 底层表：site_config（KV 形式，configKey 唯一）
 * 整个站点配置以 JSON 存储在 configKey = 'site_config' 的单行中。
 *
 * 读取策略：D1 无配置时由调用方回退到静态 config/site.config.json。
 * 写入策略：需要 edit_database 权限，并写 admin_log。
 */

import type { CurrentUser } from "../utils/permission";
import { can } from "../utils/permission";
import { PERM_EDIT_DATABASE } from "../shared/permissions";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import { writeAdminLog } from "./adminLog";

// ============================================================
//  类型定义（与 config/site.config.json 结构一致）
// ============================================================

/** 站点主题配置 */
export interface SiteConfigTheme {
  preset: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

/** 推荐流权重配置 */
export interface SiteConfigRecommendWeights {
  like: number;
  comment: number;
  follow: number;
  block: number;
  time: number;
  random: number;
}

/** 用户等级名称颜色配置（key 与 utils/userLevel.ts 的 UserLevel 一致） */
export interface SiteConfigNameColors {
  /** 普通用户 */
  normal: string;
  /** 活跃用户 */
  active: string;
  /** 认证用户 */
  verified: string;
  /** 管理员 */
  admin: string;
  /** 板块长 */
  owner: string;
  /** 站长/超级管理员 */
  superadmin: string;
}

/** 学号自动分板块配置 */
export interface SiteConfigAutoBlock {
  /** 是否开启年级板块自动创建/加入 */
  gradeEnabled: boolean;
  /** 年级起始位置（1-indexed） */
  gradeStart: number;
  /** 年级长度 */
  gradeLength: number;
  /** 年级板块名称模板，如 "{grade}级年级板" */
  gradeNameFormat: string;
  /** 是否开启班级板块自动创建/加入 */
  classEnabled: boolean;
  /** 班级起始位置（1-indexed） */
  classStart: number;
  /** 班级长度 */
  classLength: number;
  /** 班级板块名称模板，如 "{grade}年级{class}班板块" */
  classNameFormat: string;
}

/** 站点配置 */
export interface SiteConfig {
  siteName: string;
  /** 站点图标（图片 URL，可为空串表示未设置） */
  siteIcon?: string;
  authMethod: string;
  studentIdPattern: string;
  studentIdHint: string;
  defaultPermissions: number;
  archiveDays: number;
  theme: SiteConfigTheme;
  recommendWeights: SiteConfigRecommendWeights;
  /** 用户等级名称颜色 */
  nameColors: SiteConfigNameColors;
  /** 学号自动分板块配置 */
  autoBlock?: SiteConfigAutoBlock;
  /** 是否已初始化 */
  initialized?: boolean;
}

/** site_config 表中存储整份配置的 key */
const CONFIG_KEY = "site_config";

// ============================================================
//  查询函数
// ============================================================

/**
 * 读取站点配置
 *
 * @returns D1 中无配置或 JSON 损坏时返回 null（调用方回退到静态配置）
 */
export async function getSiteConfig(
  db: D1Database
): Promise<SiteConfig | null> {
  const row = await db
    .prepare("SELECT configValue FROM site_config WHERE configKey = ?")
    .bind(CONFIG_KEY)
    .first<{ configValue: string }>();

  if (!row) return null;

  try {
    return JSON.parse(row.configValue) as SiteConfig;
  } catch {
    // JSON 损坏 → 视为无配置，由调用方回退
    return null;
  }
}

// ============================================================
//  写入函数
// ============================================================

/**
 * 校验配置结构（防止写入损坏的配置导致全站读取失败）
 */
function isValidSiteConfig(config: unknown): config is SiteConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  return (
    typeof c.siteName === "string" &&
    typeof c.authMethod === "string" &&
    typeof c.studentIdPattern === "string" &&
    typeof c.studentIdHint === "string" &&
    typeof c.defaultPermissions === "number" &&
    typeof c.archiveDays === "number" &&
    !!c.theme && typeof c.theme === "object" &&
    !!c.recommendWeights && typeof c.recommendWeights === "object" &&
    !!c.nameColors && typeof c.nameColors === "object"
  );
}

/**
 * 更新站点配置（管理员操作）
 *
 * 需要 edit_database 权限。upsert 到 site_config 表，
 * 操作记录到 admin_log（action = 'update_site_config'）。
 *
 * @returns false 表示无权限或配置结构非法
 */
export async function updateSiteConfig(
  db: D1Database,
  config: SiteConfig,
  adminUser: CurrentUser | null
): Promise<boolean> {
  if (!can(adminUser, PERM_EDIT_DATABASE)) return false;
  if (!adminUser) return false;
  if (!isValidSiteConfig(config)) return false;

  const id = generateUUID();
  const now = nowISO();
  const value = JSON.stringify(config);

  // upsert：configKey 唯一，冲突时更新值与时间戳
  await db
    .prepare(
      `INSERT INTO site_config (id, configKey, configValue, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(configKey) DO UPDATE SET configValue = ?, updatedAt = ?`
    )
    .bind(id, CONFIG_KEY, value, now, value, now)
    .run();

  await writeAdminLog(db, {
    adminId: adminUser.id,
    action: "update_site_config",
    targetType: "site_config",
    targetId: CONFIG_KEY,
    detail: value,
  });

  return true;
}
