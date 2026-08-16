/**
 * 错误处理中间件
 *
 * 职责：
 *   1. 捕获路由处理中抛出的所有异常
 *   2. 统一返回 JSON 格式错误响应
 *   3. 开发环境返回详细错误信息，生产环境只返回通用提示
 */

import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContextVars } from "./auth";
import type { AppErrorCode } from "../utils/errors";
import { INTERNAL_ERROR } from "../utils/errors";

/**
 * 应用错误类
 *
 * 业务逻辑中抛出的预期错误，包含 HTTP 状态码和错误码。
 * errorHandler 会识别此类型并返回对应的结构化响应。
 */
export class AppError extends Error {
  /** HTTP 状态码 */
  public readonly statusCode: ContentfulStatusCode;
  /** 业务错误码（如 'UNAUTHORIZED'、'VALIDATION_ERROR'） */
  public readonly code: AppErrorCode;

  constructor(statusCode: ContentfulStatusCode, code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 全局错误处理中间件
 *
 * 应注册在中间件链最外层，确保所有异常都被捕获。
 */
export const errorHandler: MiddlewareHandler<{
  Variables: AppContextVars;
}> = async (c, next) => {
  try {
    await next();
  } catch (err: unknown) {
    // AppError：业务预期错误
    if (err instanceof AppError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message },
        },
        err.statusCode
      );
    }

    // 未知错误：区分环境输出
    const isDev = (c.env as Record<string, string> | null)?.NODE_ENV !== "production";
    const message = isDev && err instanceof Error ? err.message : INTERNAL_ERROR.message;
    const stack = isDev && err instanceof Error ? err.stack : undefined;

    console.error("[ErrorHandler]", err);

    return c.json(
      {
        success: false,
        error: {
          code: INTERNAL_ERROR.code,
          message,
          ...(stack && { stack }),
        },
      },
      INTERNAL_ERROR.statusCode
    );
  }
};
