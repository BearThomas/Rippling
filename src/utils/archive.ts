/**
 * 归档工具函数
 *
 * 提供归档判断、归档文件构建、归档路径生成等通用逻辑。
 * 归档目录结构：archive/YYYY-MM-DD/类型/ID.json（加密后存储）
 *
 * 稳定性设计：
 *   - SITE_URL 必须是 Cloudflare Pages 项目的完整 URL
 *     （如 https://xxx.pages.dev 或自定义域名）
 *   - archive/ 目录必须作为静态资源被 Pages 部署
 *     （脚本写入 archive/ 后由 Workflow 提交，Pages 自动部署）
 *   - DAL 层 fetch 归档文件时使用 AbortController 设置 5 秒超时
 *   - 如果 fetch 失败或超时，降级逻辑会处理（使用 D1 旧数据或返回 null）
 */

// ============================================================
//  归档环境参数（DAL 层归档回退时使用）
// ============================================================

/** DAL 函数读取归档数据所需的环境参数 */
export interface ArchiveEnv {
  /** 加密密钥（64 字符十六进制） */
  ENCRYPTION_KEY: string;
  /**
   * 站点基础 URL，用于 fetch 归档静态文件。
   * 必须是 Cloudflare Pages 项目的完整 URL，如：
   *   - "https://xxx.pages.dev"（默认 Pages 域名）
   *   - "https://custom-domain.com"（自定义域名）
   * archive/ 目录必须作为静态资源被 Pages 部署，
   * Worker 通过 fetch 本域名的静态文件来获取归档数据。
   */
  SITE_URL: string;
}

// ============================================================
//  归档文件格式
// ============================================================

/** 归档文件内容结构 */
export interface ArchiveFileContent {
  /** 归档格式版本 */
  version: 1;
  /** 归档执行时间（ISO 8601） */
  archivedAt: string;
  /** 最终状态快照（归档时刻的完整记录） */
  result: Record<string, unknown>;
  /** 完整操作链（archive_operation 表中的全部记录） */
  operations: Record<string, unknown>[];
}

// ============================================================
//  导出函数
// ============================================================

/**
 * 判断是否应归档
 *
 * @param updatedAt - ISO 8601 时间戳
 * @param archiveDays - 归档阈值天数（默认 30）
 */
export function shouldArchive(updatedAt: string, archiveDays: number): boolean {
  const updated = new Date(updatedAt);
  const threshold = Date.now() - archiveDays * 24 * 60 * 60 * 1000;
  return updated.getTime() < threshold;
}

/**
 * 构建归档文件内容
 *
 * @param result - 最终状态快照（单条记录的完整字段）
 * @param operations - 该记录的操作链（archive_operation 查询结果）
 */
export function buildArchiveFile(
  result: Record<string, unknown>,
  operations: Record<string, unknown>[]
): ArchiveFileContent {
  return {
    version: 1,
    archivedAt: new Date().toISOString(),
    result,
    operations,
  };
}

/**
 * 生成归档文件路径
 *
 * @param type - 记录类型，如 "post" / "confession" / "timeline" / "block"
 * @param id - 记录 ID
 * @param date - 归档日期，格式 YYYY-MM-DD
 * @returns 相对路径，如 "archive/2026-09-01/post/xxx-uuid.json"
 */
export function getArchivePath(
  type: string,
  id: string,
  date: string
): string {
  return `archive/${date}/${type}/${id}.json`;
}
