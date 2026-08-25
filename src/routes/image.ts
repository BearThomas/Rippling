/**
 * 图片代理 API 路由
 *
 * 路由表（挂载前缀 /api/image）：
 *   GET /?key=images/2025-08/xxx.jpg   从 B2 私有 Bucket 读取图片并透传二进制
 *
 * 背景：
 *   B2 Bucket 为 Private，上传后的 B2 直连 URL 无法公开访问，
 *   因此通过本接口代理读取，前端统一使用 /api/image?key=xxx 地址。
 *
 * 约束：
 *   - 公开接口（帖子图片需游客可见），authMiddleware 为可选认证不影响匿名访问
 *   - key 仅允许 images/ 前缀，禁止 ".." 与反斜杠，防止路径穿越
 *   - 成功时直接返回二进制（不做 JSON 包装），并设置长期缓存
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { NOT_FOUND, INTERNAL_ERROR } from "../utils/errors";
import { getImageFromB2 } from "../utils/b2";

// ============================================================
//  类型定义与常量
// ============================================================

type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 图片代理响应缓存策略：一年 + immutable（对象 key 含 UUID，内容永不变更） */
const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** 校验对象 key 是否安全：必须 images/ 前缀，且不含路径穿越字符 */
function isSafeImageKey(key: string): boolean {
  return (
    key.startsWith("images/") &&
    !key.includes("..") &&
    !key.includes("\\")
  );
}

const imageRoutes = new Hono<E>();

// ------------------------------------------------------------
//  GET /  — 读取 B2 私有图片（公开，无需登录）
// ------------------------------------------------------------

imageRoutes.get("/", async (c) => {
  const key = c.req.query("key") ?? "";

  // key 安全校验：非空 + images/ 前缀 + 无穿越字符（不合法统一按 404 处理，避免探测）
  if (!key || !isSafeImageKey(key)) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  let image: { body: ArrayBuffer; contentType: string } | null;
  try {
    image = await getImageFromB2(key, c.env);
  } catch (err) {
    console.error("[Image] B2 read failed:", err);
    return c.json(
      {
        success: false,
        error: { code: INTERNAL_ERROR.code, message: "图片加载失败，请稍后重试" },
      },
      INTERNAL_ERROR.statusCode as any
    );
  }

  // B2 中不存在该对象 → 统一 404 响应
  if (!image) {
    return c.json(
      { success: false, error: { code: NOT_FOUND.code, message: NOT_FOUND.message } },
      NOT_FOUND.statusCode as any
    );
  }

  // 直接返回二进制内容（不做 JSON 包装）
  return c.body(image.body, 200, {
    "Content-Type": image.contentType,
    "Cache-Control": IMAGE_CACHE_CONTROL,
  });
});

export default imageRoutes;
