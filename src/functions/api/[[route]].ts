/**
 * Hono 后端入口
 *
 * 当前为占位实现，后续 Task 会在此挂载路由模块：
 * - /api/posts        帖子 CRUD
 * - /api/blocks       板块管理
 * - /api/timeline     大事记
 * - /api/confession   表白墙
 * - ...
 */

import { Hono } from "hono";

const app = new Hono();

// 健康检查
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    project: "Rippling",
    timestamp: new Date().toISOString(),
  });
});

// 根路径占位
app.get("/", (c) => {
  return c.json({ message: "Rippling API is running" });
});

export default app;
