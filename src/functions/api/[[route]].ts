/**
 * Hono 后端入口
 *
 * 中间件注册顺序（由外到内）：
 *   1. loggerMiddleware   — 请求日志（全局）
 *   2. errorHandler       — 全局错误捕获（全局）
 *   3. authMiddleware     — 认证（仅受保护路由）
 *   4. deviceMiddleware   — 设备识别（仅受保护路由）
 *
 * 已挂载路由：
 *   - /api/post         帖子 / 评论 CRUD
 *   - /api/like         点赞
 *   - /api/confession   表白墙
 *   - /api/timeline     大事记
 *   - /api/vote         投票
 *   - /api/recommend    推荐流 / 置顶
 *
 * 待挂载路由：
 *   - /api/block        板块管理
 *   - ...
 */

import { Hono } from "hono";
import { loggerMiddleware } from "../../middleware/logger";
import { errorHandler } from "../../middleware/error";
import { authMiddleware } from "../../middleware/auth";
import { deviceMiddleware } from "../../middleware/device";
import { postRoutes, likeRoutes, confessionRoutes, timelineRoutes, voteRoutes, recommendRoutes } from "../../routes";
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
//  业务路由模块在此分组后挂载。
// ============================================================

app.use("/api/*", authMiddleware);
app.use("/api/*", deviceMiddleware);

// 帖子 / 评论
app.route("/api/post", postRoutes);

// 点赞
app.route("/api/like", likeRoutes);

// 表白墙
app.route("/api/confession", confessionRoutes);

// 大事记
app.route("/api/timeline", timelineRoutes);

// 投票
app.route("/api/vote", voteRoutes);

// 推荐流 / 置顶
app.route("/api/recommend", recommendRoutes);

// TODO: 后续 Task 继续挂载
// app.route("/api/block", blockRoutes);

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
