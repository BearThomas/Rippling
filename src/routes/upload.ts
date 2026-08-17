/**
 * 图片上传 API 路由
 *
 * 路由表（挂载前缀 /api/upload）：
 *   POST /image   上传图片到 Backblaze B2（需 upload_image 权限）
 *
 * 约束：
 *   - multipart/form-data，字段名 file
 *   - 仅允许 jpeg / png / webp / gif
 *   - 大小上限 2MB（超过提示前端压缩后再传）
 *   - 内存频率限制：每用户每小时 50 次
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import type { AppContextVars } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { PERM_UPLOAD_IMAGE } from "../shared/permissions";
import { VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR } from "../utils/errors";
import { checkRateLimit } from "../utils/rate-limit";
import { uploadImageToB2, ALLOWED_IMAGE_TYPES } from "../utils/b2";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";

// ============================================================
//  类型定义与常量
// ============================================================

type E = { Bindings: CloudflareEnv; Variables: AppContextVars };

/** 图片大小上限：2MB */
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const uploadRoutes = new Hono<E>();

// ------------------------------------------------------------
//  POST /image  — 上传图片（multipart/form-data）
// ------------------------------------------------------------

uploadRoutes.post("/image", requirePermission(PERM_UPLOAD_IMAGE), async (c) => {
  const user = c.get("user")!;

  // 频率限制：每小时 50 次
  const rate = checkRateLimit(user.id, "upload_image", 3600, 50);
  if (rate.limited) {
    return c.json(
      { success: false, error: { code: RATE_LIMITED.code, message: "上传过于频繁，请稍后再试" } },
      RATE_LIMITED.statusCode as any
    );
  }

  // 解析 multipart 表单
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "请求格式错误，需为 multipart/form-data" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  const entry = formData.get("file");
  // 稳定版 @cloudflare/workers-types 将 FormData.get 类型收窄为 string | null，
  // 但运行时 multipart 文件字段实际为 File，需下方断言还原
  if (!entry || typeof entry === "string") {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "缺少文件字段 file" } },
      VALIDATION_ERROR.statusCode as any
    );
  }
  const file = entry as unknown as File;

  // 类型校验（白名单）
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "仅支持 JPEG / PNG / WebP / GIF 图片" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 大小校验：超过 2MB 提示前端压缩
  if (file.size > MAX_IMAGE_SIZE) {
    return c.json(
      { success: false, error: { code: VALIDATION_ERROR.code, message: "图片超过 2MB，请压缩后再上传" } },
      VALIDATION_ERROR.statusCode as any
    );
  }

  // 上传到 B2
  let url: string;
  try {
    url = await uploadImageToB2(file, c.env);
  } catch (err) {
    console.error("[Upload] B2 upload failed:", err);
    return c.json(
      { success: false, error: { code: INTERNAL_ERROR.code, message: "图片上传失败，请稍后重试" } },
      INTERNAL_ERROR.statusCode as any
    );
  }

  // 记录到 user_log（可选审计项，不阻塞主流程）
  await c.env.DB.prepare(
    "INSERT INTO user_log (id, userId, action, detail, createdAt) VALUES (?, ?, 'upload_image', ?, ?)"
  )
    .bind(generateUUID(), user.id, JSON.stringify({ url }), nowISO())
    .run()
    .catch((err) => console.error("[Upload] user_log write failed:", err));

  return c.json({ success: true, data: { url } });
});

export default uploadRoutes;
