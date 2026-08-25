/**
 * 内存频率限制器（临时方案）
 *
 * 简单的基于内存的请求频率限制，按 key + 操作类型 计数。
 *
 * ⚠️ 这是临时方案：
 *   数据存储在 Worker 内存中，重启/新实例后丢失。
 *   Task 6 会用 D1 持久化替换本模块，实现跨实例共享。
 */

interface RateLimitEntry {
  /** 当前窗口内的请求次数 */
  count: number;
  /** 窗口开始时间（ms） */
  windowStart: number;
}

/** 存储：key = `${operation}:${identifier}` */
const store = new Map<string, RateLimitEntry>();

/**
 * 检查是否超过频率限制
 *
 * @param key       - 唯一标识（如 IP 地址、用户名）
 * @param operation - 操作类型（如 'register'、'login'）
 * @param windowSec - 时间窗口（秒）
 * @param maxCount  - 窗口内允许的最大次数
 * @returns `{ limited: false, remaining, resetAt }` 或 `{ limited: true, retryAfter, resetAt }`
 */
export function checkRateLimit(
  key: string,
  operation: string,
  windowSec: number,
  maxCount: number
):
  | { limited: false; remaining: number; resetAt: number }
  | { limited: true; retryAfter: number; resetAt: number } {
  const now = Date.now();
  const storeKey = `${operation}:${key}`;
  const windowMs = windowSec * 1000;

  const entry = store.get(storeKey);

  // 无记录 或 窗口已过期 → 重置（惰性清理：过期 entry 直接覆盖）
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(storeKey, { count: 1, windowStart: now });
    return { limited: false, remaining: maxCount - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > maxCount) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { limited: true, retryAfter, resetAt: entry.windowStart + windowMs };
  }

  return {
    limited: false,
    remaining: maxCount - entry.count,
    resetAt: entry.windowStart + windowMs,
  };
}

/**
 * 清除指定 key + 操作 的计数（如登录成功后重置失败计数）
 */
export function resetRateLimit(key: string, operation: string): void {
  store.delete(`${operation}:${key}`);
}

/**
 * 定期清理过期条目，防止内存泄漏
 *
 * 可选，不推荐手动调用。
 * 正常流程中 checkRateLimit 已内置惰性清理（过期 entry 访问时自动重置）。
 * 若需定期全量清理，建议通过 Cron Trigger 调用。
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [storeKey, entry] of store) {
    // 默认检查 1 小时窗口，过期则删除
    if (now - entry.windowStart > 3600_000) {
      store.delete(storeKey);
    }
  }
}
