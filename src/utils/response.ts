/**
 * 统一响应格式工具
 *
 * 成功：{ success: true, data, message? }
 * 失败：{ success: false, error: { code, message } }
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";

/** 成功响应 200 */
export function ok<T>(data: T, message?: string) {
  return {
    success: true as const,
    data,
    ...(message !== undefined && { message }),
  };
}

/** 创建成功响应 201 */
export function created<T>(data: T, message?: string) {
  return {
    success: true as const,
    data,
    ...(message !== undefined && { message }),
  };
}

/** 错误响应 */
export function error(
  statusCode: ContentfulStatusCode,
  code: string,
  message: string
) {
  return {
    success: false as const,
    error: { code, message },
  };
}
