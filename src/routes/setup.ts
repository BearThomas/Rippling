/**
 * 初始化向导路由（公开接口，仅首次部署后使用）
 *
 * 路由表（挂载前缀 /api/setup）：
 *   GET  /status        查询初始化状态（site_config 是否有 initialized 标记）
 *   POST /upload-icon   上传站点图标（仅未初始化时可调用，复用 B2 上传）
 *   POST /initialize    创建超级管理员 + 写入站点配置（仅一次）
 *
 * 设计说明：
 *   - 管理员账号通过 Better Auth 内部 API（auth.api.signUpEmail）创建，
 *     密码哈希算法由 Better Auth 处理，保证与登录通道兼容
 *   - 学号作为登录邮箱前缀（学号@rippling.local），与前端 api/auth.ts
 *     的 toStudentEmail 规则一致
 *   - 站点配置基于静态 site.config.json 模板，仅覆盖向导填写的字段
 *   - 初始化阶段没有管理员会话，site_config 采用直接 SQL upsert
 *     （updateSiteConfig 需要权限与 admin_log，此处不适用）
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../auth";
import { createAuth } from "../auth";
import { ALL_PERMISSIONS_MASK } from "../utils/userLevel";
import { INTERNAL_ERROR, VALIDATION_ERROR } from "../utils/errors";
import { getSiteConfig } from "../db/siteConfig";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import { uploadImageToB2, ALLOWED_IMAGE_TYPES } from "../utils/b2";
import staticConfig from "../config/site.config.json";

const app = new Hono<{ Bindings: CloudflareEnv }>();

/** 占位邮箱域名（学号不是合法邮箱，拼接后传输，与前端一致） */
const STUDENT_EMAIL_DOMAIN = "rippling.local";

/** 站长昵称 / 徽章 / 颜色 */
const ADMIN_NAME = "站长";
const ADMIN_BADGE = "站长";
const ADMIN_NAME_COLOR = "#F59E0B";

/** site_config 表中存储整份配置的 key（与 db/siteConfig.ts 保持一致） */
const CONFIG_KEY = "site_config";

/** 图标大小上限：2MB（与 /api/upload/image 一致） */
const MAX_ICON_SIZE = 2 * 1024 * 1024;

/** 检查 B2 图床环境变量是否配置齐全 */
function isB2Configured(env: CloudflareEnv): boolean {
  return Boolean(
    env.B2_BUCKET_NAME &&
      env.B2_ACCESS_KEY_ID &&
      env.B2_SECRET_ACCESS_KEY &&
      env.B2_ENDPOINT
  );
}

// ============================================================
//  GET /api/setup/status — 查询初始化状态
// ============================================================

app.get("/status", async (c) => {
  try {
    const config = await getSiteConfig(c.env.DB);
    return c.json({
      success: true,
      data: { initialized: config?.initialized === true },
    });
  } catch (error) {
    console.error("[setup] 查询初始化状态失败:", error);
    return c.json(
      {
        success: false,
        error: { code: INTERNAL_ERROR.code, message: "获取初始化状态失败" },
      },
      INTERNAL_ERROR.statusCode
    );
  }
});

// ============================================================
//  POST /api/setup/upload-icon — 上传站点图标（仅未初始化）
// ============================================================
//
//  multipart/form-data，字段名 file（image/jpeg、image/png、
//  image/webp、image/gif，≤2MB）。复用 B2 上传逻辑。
//  已初始化的站点禁止调用（返回 404）。

app.post("/upload-icon", async (c) => {
  try {
    // 仅未初始化时可调用
    const existingConfig = await getSiteConfig(c.env.DB);
    if (existingConfig?.initialized === true) {
      return c.json(
        {
          success: false,
          error: { code: "ALREADY_INITIALIZED", message: "站点已初始化，请从管理面板更换图标" },
        },
        404
      );
    }

    // B2 未配置时提示前端（向导页可感知并隐藏上传入口）
    if (!isB2Configured(c.env)) {
      return c.json(
        {
          success: false,
          error: {
            code: "IMAGE_HOST_NOT_CONFIGURED",
            message: "图床未配置，暂无法上传图标",
          },
        },
        400
      );
    }

    // 解析 multipart 表单
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json(
        {
          success: false,
          error: { code: VALIDATION_ERROR.code, message: "请求格式错误，需为 multipart/form-data" },
        },
        VALIDATION_ERROR.statusCode as any
      );
    }

    const entry = formData.get("file");
    // FormData.get 在类型上收窄为 string | null，运行时文件字段为 File
    if (!entry || typeof entry === "string") {
      return c.json(
        {
          success: false,
          error: { code: VALIDATION_ERROR.code, message: "缺少文件字段 file" },
        },
        VALIDATION_ERROR.statusCode as any
      );
    }
    const file = entry as unknown as File;

    // 类型校验（白名单，与 /api/upload/image 一致）
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return c.json(
        {
          success: false,
          error: { code: VALIDATION_ERROR.code, message: "仅支持 JPEG / PNG / WebP / GIF 图片" },
        },
        VALIDATION_ERROR.statusCode as any
      );
    }

    // 大小校验
    if (file.size > MAX_ICON_SIZE) {
      return c.json(
        {
          success: false,
          error: { code: VALIDATION_ERROR.code, message: "图片超过 2MB，请压缩后再上传" },
        },
        VALIDATION_ERROR.statusCode as any
      );
    }

    // 上传到 B2
    const result = await uploadImageToB2(file, c.env);

    // B2 Bucket 私有，直连 URL 无法公开访问，统一返回同域代理地址
    const url = `/api/image?key=${encodeURIComponent(result.key)}`;

    return c.json({ success: true, data: { url } });
  } catch (error) {
    console.error("[setup] 上传站点图标失败:", error);
    return c.json(
      {
        success: false,
        error: {
          code: INTERNAL_ERROR.code,
          message: error instanceof Error ? `上传失败: ${error.message}` : "上传失败，请稍后重试",
        },
      },
      INTERNAL_ERROR.statusCode as any
    );
  }
});

// ============================================================
//  POST /api/setup/initialize — 初始化站点（仅一次）
// ============================================================

interface InitializeBody {
  siteName: string;
  studentIdPattern: string;
  studentIdHint: string;
  adminStudentId: string;
  adminPassword: string;
  theme?: string;
  /** 站点图标 URL（可选，来自 /api/setup/upload-icon 返回） */
  siteIcon?: string;
}

app.post("/initialize", async (c) => {
  try {
    // 1. 防重复检查：站点配置已标记初始化
    const existingConfig = await getSiteConfig(c.env.DB);
    if (existingConfig?.initialized === true) {
      return c.json(
        {
          success: false,
          error: { code: "ALREADY_INITIALIZED", message: "站点已初始化，无法重复初始化" },
        },
        400
      );
    }

    // 2. 防重复兜底：已存在超级管理员（上次初始化部分成功时拦截）
    const adminCheck = await c.env.DB
      .prepare("SELECT userId FROM user_profile WHERE permissions = ? LIMIT 1")
      .bind(Number(ALL_PERMISSIONS_MASK))
      .first<{ userId: string }>();
    if (adminCheck) {
      return c.json(
        {
          success: false,
          error: {
            code: "ALREADY_INITIALIZED",
            message: "站点已存在超级管理员，若初始化未完成请联系部署者清理数据",
          },
        },
        400
      );
    }

    // 3. 解析并校验请求体
    const body = (await c.req.json().catch(() => null)) as InitializeBody | null;
    const badRequest = (message: string) =>
      c.json(
        {
          success: false,
          error: { code: VALIDATION_ERROR.code, message },
        },
        VALIDATION_ERROR.statusCode
      );

    if (!body) return badRequest("请求体必须是 JSON");
    const siteName = body.siteName?.trim();
    const studentIdPattern = body.studentIdPattern?.trim();
    const studentIdHint = body.studentIdHint?.trim();
    const adminStudentId = body.adminStudentId?.trim();
    const adminPassword = body.adminPassword;

    if (!siteName || !studentIdPattern || !studentIdHint || !adminStudentId || !adminPassword) {
      return badRequest("所有字段都是必填的");
    }
    if (adminPassword.length < 8) {
      return badRequest("密码至少需要 8 位");
    }

    // 4. 创建超级管理员（Better Auth 内部 API，密码哈希由 Better Auth 处理）
    const auth = createAuth(c.env);
    const email = `${adminStudentId}@${STUDENT_EMAIL_DOMAIN}`;
    const signUpResult = await auth.api.signUpEmail({
      body: { name: ADMIN_NAME, email, password: adminPassword },
    });
    const userId = signUpResult.user.id;

    // 5. 写入 user_profile（权限全开 + 站长徽章）
    const now = nowISO();
    await c.env.DB
      .prepare(
        `INSERT INTO user_profile
           (id, userId, studentId, username, permissions, nameColor, badge,
            questionBoxEnabled, violationCount, isDeactivated, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
      )
      .bind(
        generateUUID(),
        userId,
        adminStudentId,
        ADMIN_NAME,
        Number(ALL_PERMISSIONS_MASK),
        ADMIN_NAME_COLOR,
        ADMIN_BADGE,
        now,
        now
      )
      .run();

    // 6. 写入站点配置（基于静态模板，覆盖向导字段，标记已初始化）
    const siteConfig = {
      ...staticConfig,
      siteName,
      studentIdPattern,
      studentIdHint,
      theme: { ...staticConfig.theme, preset: body.theme || "light" },
      siteIcon: body.siteIcon?.trim() ?? "",
      initialized: true,
    };
    const configValue = JSON.stringify(siteConfig);
    await c.env.DB
      .prepare(
        `INSERT INTO site_config (id, configKey, configValue, updatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(configKey) DO UPDATE SET configValue = ?, updatedAt = ?`
      )
      .bind(generateUUID(), CONFIG_KEY, configValue, now, configValue, now)
      .run();

    return c.json({
      success: true,
      message: "初始化成功",
      data: { adminStudentId },
    });
  } catch (error) {
    console.error("[setup] 初始化失败:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "INITIALIZATION_FAILED",
          message: "初始化失败，请检查参数或联系支持",
        },
      },
      500
    );
  }
});

export default app;
