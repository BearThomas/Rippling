/**
 * 常见错误常量
 *
 * 每个常量包含 statusCode、code、message，供 error() 和 AppError 使用。
 * 使用 as const 确保 TypeScript 推断出精确的字面量类型。
 */

export const UNAUTHORIZED = {
  statusCode: 401,
  code: "UNAUTHORIZED",
  message: "未登录",
} as const;

export const FORBIDDEN = {
  statusCode: 403,
  code: "FORBIDDEN",
  message: "无权限",
} as const;

export const NOT_FOUND = {
  statusCode: 404,
  code: "NOT_FOUND",
  message: "资源不存在",
} as const;

export const VALIDATION_ERROR = {
  statusCode: 400,
  code: "VALIDATION_ERROR",
  message: "参数错误",
} as const;

export const RATE_LIMITED = {
  statusCode: 429,
  code: "RATE_LIMITED",
  message: "操作过于频繁",
} as const;

export const INTERNAL_ERROR = {
  statusCode: 500,
  code: "INTERNAL_ERROR",
  message: "服务器错误",
} as const;

// ============================================================
//  类型 & 集合
// ============================================================

/** 所有错误常量的 code 联合类型 */
export type AppErrorCode =
  | typeof UNAUTHORIZED.code
  | typeof FORBIDDEN.code
  | typeof NOT_FOUND.code
  | typeof VALIDATION_ERROR.code
  | typeof RATE_LIMITED.code
  | typeof INTERNAL_ERROR.code;

/** 所有错误常量集合，便于遍历和查找 */
export const APP_ERRORS = {
  UNAUTHORIZED,
  FORBIDDEN,
  NOT_FOUND,
  VALIDATION_ERROR,
  RATE_LIMITED,
  INTERNAL_ERROR,
} as const;
