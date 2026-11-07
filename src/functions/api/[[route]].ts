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
 *   - /api/search       搜索
 *   - /api/follow       关注
 *   - /api/question     提问箱
 *   - /api/notification 通知
 *   - /api/block        板块管理
 *   - /api/ticket       工单系统
 *   - /api/admin        管理员用户管理
 *   - /api/admin-log    管理日志（公开）
 *   - /api/permissions  当前用户权限查询（公开）
 *   - /api/upload       图片上传（B2）
 *   - /api/image        图片代理（读取 B2 私有 Bucket，公开）
 *   - /api/user         用户资料 / 帖子评论列表 / 账号设置
 *   - /api/setup        初始化向导（公开）
 *
 * 待挂载路由：
 *   - ...
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../../auth";
import { loggerMiddleware } from "../../middleware/logger";
import { errorHandler } from "../../middleware/error";
import { authMiddleware } from "../../middleware/auth";
import type { AppContextVars } from "../../middleware/auth";
import { deviceMiddleware } from "../../middleware/device";
import { edgeCache } from "../../middleware/edgeCache";
import { postRoutes, likeRoutes, confessionRoutes, timelineRoutes, voteRoutes, recommendRoutes, searchRoutes, followRoutes, questionRoutes, notificationRoutes, blockRoutes, ticketRoutes, adminRoutes, adminLogRoutes, permissionRoutes, uploadRoutes, imageRoutes, userRoutes, setupRoutes } from "../../routes";
import { nowISO } from "../../utils/time";
import { NOT_FOUND } from "../../utils/errors";
import { getSiteConfig } from "../../db";
import siteConfig from "../../config/site.config.json";

// export：Worker 入口（src/worker.ts）复用同一个 app 实例，
// Pages 入口继续用下面的 onRequest 包装。
export const app = new Hono<{ Bindings: CloudflareEnv; Variables: AppContextVars }>();

// ============================================================
//  全局中间件
// ============================================================

app.use("*", loggerMiddleware);
app.use("*", errorHandler);

// 边缘缓存：命中的 GET 请求直接返回，连下面的认证/数据库都不走
app.use("/api/*", edgeCache);

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

/** 站点配置：优先从 D1 读取，无配置时回退静态 site.config.json */
app.get("/api/config", async (c) => {
  const dbConfig = await getSiteConfig(c.env.DB);

  return c.json({
    success: true,
    data: dbConfig ?? siteConfig,
  });
});

// 初始化向导（公开接口）
app.route("/api/setup", setupRoutes);

// ============================================================
//  受保护路由（需要认证 + 设备识别）
//
//  业务路由模块在此分组后挂载。
// ============================================================

app.use("/api/*", authMiddleware);
app.use("/api/*", deviceMiddleware);

// ------------------------------------------------------------
//  GET /api/bootstrap — 首屏一次性拿齐（配置 / 是否初始化 / 会话 / 权限）
//
//  以前前端启动要打 4 个接口：/api/setup/status、/api/config、
//  /api/auth/get-session、/api/permissions/me。跨境环境下每个都要
//  0.7~2 秒，串起来就是首屏卡半天的原因。合成一个之后只剩一次往返。
// ------------------------------------------------------------

app.get("/api/bootstrap", async (c) => {
  const user = c.get("user");
  const dbConfig = await getSiteConfig(c.env.DB);

  return c.json({
    success: true,
    data: {
      /** 是否已完成初始化向导（前端路由守卫用它，不再每次导航都请求） */
      initialized: dbConfig?.initialized === true,
      /** 站点配置（D1 优先，没有就回退静态模板） */
      config: dbConfig ?? siteConfig,
      /** 原始会话（游客为 null），形状与 /api/auth/get-session 一致 */
      session: c.get("authSession") ?? null,
      /** 权限掩码十进制字符串，游客为 "0" */
      permissions: user ? user.permissions.toString() : "0",
    },
  });
});

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

// 搜索
app.route("/api/search", searchRoutes);

// 关注
app.route("/api/follow", followRoutes);

// 提问箱
app.route("/api/question", questionRoutes);

// 通知
app.route("/api/notification", notificationRoutes);

// 板块管理
app.route("/api/block", blockRoutes);

// 工单系统
app.route("/api/ticket", ticketRoutes);

// 管理员用户管理
app.route("/api/admin", adminRoutes);

// 管理日志（公开接口）
app.route("/api/admin-log", adminLogRoutes);

// 当前用户权限查询（自己看自己，无需权限位；未登录返回 "0"）
app.route("/api/permissions", permissionRoutes);

// 图片上传（B2）
app.route("/api/upload", uploadRoutes);

// 图片代理（读取 B2 私有 Bucket，公开接口）
app.route("/api/image", imageRoutes);

// 用户资料 / 帖子评论列表 / 账号设置
app.route("/api/user", userRoutes);

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

// ============================================================
//  Pages Functions 入口
//
//  Cloudflare Pages 只识别 onRequest 导出（不认 export default），
//  因此将 Hono app 包装为 PagesFunction 后导出。
// ============================================================

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  // 传 executionCtx：边缘缓存中间件要用 waitUntil 把响应写进缓存
  return app.fetch(context.request, context.env, context as unknown as ExecutionContext);
};
