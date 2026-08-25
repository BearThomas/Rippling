/**
 * 请求日志中间件
 *
 * 职责：
 *   记录每个请求的方法、路径、状态码、耗时。
 *   输出格式：[ISO时间] METHOD /path 200 15ms
 *
 * TODO: 后续会扩展到管理日志（写入 admin_log 表），
 *       并支持按级别过滤和结构化日志输出。
 */

import type { MiddlewareHandler } from "hono";
import type { AppContextVars } from "./auth";

/**
 * 请求日志中间件
 *
 * 在请求前后记录时间差，输出简洁的单行日志。
 */
export const loggerMiddleware: MiddlewareHandler<{
  Variables: AppContextVars;
}> = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const time = new Date().toISOString();

  console.log(`[${time}] ${method} ${path} ${status} ${duration}ms`);
};
