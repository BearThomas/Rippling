/**
 * 搜索 API 路由
 *
 * 路由表（挂载前缀 /api/search）：
 *   GET /  — 全站搜索
 *
 * 搜索范围：帖子、评论、用户、板块、大事记、表白墙
 * 支持 type 过滤：all | post | user | block | timeline | confession | comment
 *
 * 安全规则：
 *   - 学号（studentId）永不返回
 *   - 表白墙 authorId 永不返回
 *   - 帖子需经过 visibility + block 权限过滤
 *   - 未登录用户可搜索（返回公开内容）
 *
 * 频率限制：每小时 60 次（按 userId 或 IP）
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import {
  searchPosts,
  searchComments,
  searchUsers,
  searchBlocks,
  searchTimeline,
  searchConfessions,
  searchAll,
} from "../db";
import type { SearchAllResult } from "../db/search";
import type { CurrentUser } from "../utils/permission";
import { checkRateLimit } from "../utils/rate-limit";
import { VALIDATION_ERROR, RATE_LIMITED } from "../utils/errors";

// ============================================================
//  类型定义
// ============================================================

/** 搜索路由的 Hono 泛型 */
type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 允许的搜索类型 */
const SEARCH_TYPES = ["all", "post", "user", "block", "timeline", "confession", "comment"] as const;

// ============================================================
//  路由实例
// ============================================================

const searchRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /  — 全站搜索
// ------------------------------------------------------------

searchRoutes.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const type = (c.req.query("type") ?? "all") as string;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // 参数校验
  if (!q || q.length < 1) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "搜索关键词不能为空" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  if (!SEARCH_TYPES.includes(type as typeof SEARCH_TYPES[number])) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: `type 须为 ${SEARCH_TYPES.join("|")} 之一` } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 频率限制：每小时 60 次（按 userId 或 IP）
  const user = c.get("user");
  const rateKey = user?.id ?? c.req.header("CF-Connecting-IP") ?? "unknown";
  const rate = checkRateLimit(rateKey, "search", 3600, 60);
  if (rate.limited) {
    return c.json(
      { success: false, error: { code: RATE_LIMITED.code, message: RATE_LIMITED.message } },
      RATE_LIMITED.statusCode as any
    );
  }

  const cu = user as CurrentUser | null;
  let results: SearchAllResult = {};
  let total = 0;

  switch (type) {
    case "post":
      results.posts = await searchPosts(c.env.DB, q, cu, limit, offset);
      total = results.posts.length;
      break;
    case "comment":
      results.comments = await searchComments(c.env.DB, q, cu, limit, offset);
      total = results.comments.length;
      break;
    case "user":
      results.users = await searchUsers(c.env.DB, q, limit, offset);
      total = results.users.length;
      break;
    case "block":
      results.blocks = await searchBlocks(c.env.DB, q, cu, limit, offset);
      total = results.blocks.length;
      break;
    case "timeline":
      results.timeline = await searchTimeline(c.env.DB, q, limit, offset);
      total = results.timeline.length;
      break;
    case "confession":
      results.confessions = await searchConfessions(c.env.DB, q, limit, offset);
      total = results.confessions.length;
      break;
    case "all":
    default:
      results = await searchAll(c.env.DB, q, cu, limit, offset);
      // 计算总数
      total = Object.values(results).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      break;
  }

  return c.json({
    success: true,
    data: {
      q,
      type,
      results,
      total,
    },
  });
});

export default searchRoutes;
