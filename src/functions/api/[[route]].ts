/**
 * Hono 后端入口
 *
 * 中间件注册顺序（由外到内）：
 *   1. loggerMiddleware   — 请求日志（全局）
 *   2. errorHandler       — 全局错误捕获（全局）
 *   3. authMiddleware     — 认证（仅受保护路由）
 *   4. deviceMiddleware   — 设备识别（仅受保护路由）
 *
 * 后续 Task 会在此挂载路由模块：
 *   - /api/posts        帖子 CRUD
 *   - /api/blocks       板块管理
 *   - /api/timeline     大事记
 *   - /api/confession   表白墙
 *   - ...
 */

import { Hono } from "hono";
import { loggerMiddleware } from "../../middleware/logger";
import { errorHandler } from "../../middleware/error";
import { authMiddleware } from "../../middleware/auth";
import { deviceMiddleware } from "../../middleware/device";
import { nowISO } from "../../utils/time";
import { NOT_FOUND } from "../../utils/errors";
import siteConfig from "../../../config/site.config.json";

const app = new Hono();

// ============================================================
//  全局中间件
// ============================================================

app.use("*", loggerMiddleware);
app.use("*", errorHandler);

// ============================================================
//  公开路由（无需认证）
// ============================================================

/** 健康检查 */
app.get("/api/health", (c) => {
  return c.json({
    success: true,
    data: { status: "ok", time: nowISO() },
  });
});

/** 公开站点配置（后续改为从 D1 读取） */
app.get("/api/config", (c) => {
  return c.json({
    success: true,
    data: siteConfig,
  });
});

// ============================================================
//  受保护路由（需要认证 + 设备识别）
//
//  后续 Task 的所有业务路由（帖子、评论、板块等）
//  都注册在这个分组之后。
// ============================================================

app.use("/api/*", authMiddleware);
app.use("/api/*", deviceMiddleware);

// TODO: 后续 Task 在此挂载业务路由
// app.route("/api/posts", postRoutes);
// app.route("/api/blocks", blockRoutes);

// ============================================================
//  404 兜底
// ============================================================

app.all("*", (c) => {
  return c.json(
    {
      success: false,
      error: { code: NOT_FOUND.code, message: NOT_FOUND.message },
    },
    NOT_FOUND.statusCode
  );
});

export default app;
