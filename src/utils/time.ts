/**
 * 时间工具
 *
 * 统一使用 ISO 8601 字符串格式，与 D1 数据库约定一致。
 */

/** 返回当前时间的 ISO 8601 字符串（如 2026-08-16T12:00:00.000Z） */
export function nowISO(): string {
  return new Date().toISOString();
}
