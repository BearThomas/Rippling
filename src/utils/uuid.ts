/**
 * UUID 生成工具
 *
 * 使用 crypto.randomUUID()，Cloudflare Workers 原生支持。
 */

/** 生成一个 UUID v4 字符串 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
