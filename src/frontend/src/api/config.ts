/**
 * 站点配置 API（/api/config，公开接口）
 */

import { apiGet } from "./client";
import type { SiteConfig } from "../types";

/** 获取站点配置（D1 无配置时后端回退静态 site.config.json） */
export function getSiteConfig(): Promise<SiteConfig> {
  return apiGet<SiteConfig>("/api/config");
}

/** 健康检查 */
export function getHealth(): Promise<{ status: string }> {
  return apiGet<{ status: string }>("/api/health", { silentError: true });
}
