import { Hono } from "hono";
import { ALL_PERMISSIONS_MASK } from "../utils/userLevel";
import type { Context } from "hono";
import { INTERNAL_ERROR } from "../utils/errors";
import type { SiteConfig } from "../config/siteConfig";
import { getSiteConfig, updateSiteConfig } from "../db/siteConfig";
import { generateUUID } from "../utils/uuid";
import { nowISO } from "../utils/time";
import { writeAdminLog } from "../db/adminLog";

const app = new Hono();

// 初始化状态检查
app.get("/status", async (c: Context) => {
  try {
    const initialized = await getSiteConfig(c.env.DB);
    return c.json({
      success: true,
      data: { initialized: initialized?.initialized === true },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: INTERNAL_ERROR.code,
          message: "获取初始化状态失败",
        },
      },
      INTERNAL_ERROR.statusCode
    );
  }
});

// 初始化站点
app.post("/initialize", async (c: Context) => {
  try {
    // 检查是否已初始化
    const existingConfig = await getSiteConfig(c.env.DB);
    if (existingConfig?.initialized === true) {
      return c.json(
        {
          success: false,
          error: {
            code: "ALREADY_INITIALIZED",
            message: "站点已初始化，无法重复初始化",
          },
        },
        400
      );
    }

    // 简单验证请求体
    const { siteName, studentIdPattern, studentIdHint, adminStudentId, adminPassword, theme } = await c.req.json();
    
    if (!siteName || !studentIdPattern || !studentIdHint || !adminStudentId || !adminPassword) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "所有字段都是必填的",
          },
        },
        400
      );
    }
    
    if (adminPassword.length < 8) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "密码至少需要8位",
          },
        },
        400
      );
    }
    
    const body = { siteName, studentIdPattern, studentIdHint, adminStudentId, adminPassword, theme: theme || "campus" };

    // 创建超级管理员账号
    const adminId = `admin_${Date.now()}`;
    
    // 使用简单的密码哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(body.adminPassword + "salt");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 插入用户到 user 表
    await c.env.DB
      .prepare(`
        INSERT INTO user (id, name, email, image, emailVerified, createdAt)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        adminId,
        "superadmin",
        `admin@${body.siteName.toLowerCase().replace(/\s+/g, "")}.com`,
        "",
        0
      )
      .run();

    // 插入用户到 account 表（Better Auth 认证表）
    await c.env.DB
      .prepare(`
        INSERT INTO account (userId, provider, providerAccountId, type, access_token, refresh_token, expires_at, scope, id_token, token_type, session_state, oauth_token_secret, oauth_token, created_at)
        VALUES (?, 'credential', ?, 'credential', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        adminId,
        body.adminStudentId,
        hashedPassword,
        null,
        null,
        null,
        null,
        "Bearer",
        null,
        null,
        null,
        null
      )
      .run();

    // 插入用户档案到 user_profile 表
    await c.env.DB
      .prepare(`
        INSERT INTO user_profile (userId, username, displayName, permissions, nameColor, badge, bio, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        adminId,
        body.adminStudentId,
        "superadmin",
        ALL_PERMISSIONS_MASK.toString(),
        "#F59E0B", // 站长金色
        "站长",
        "系统超级管理员",
        nowISO()
      )
      .run();

    // 写入站点配置
    const siteConfig: SiteConfig = {
      siteName: body.siteName,
      authMethod: "student",
      studentIdPattern: body.studentIdPattern,
      studentIdHint: body.studentIdHint,
      defaultPermissions: 85701697087, // ROLE_USER 权限
      archiveDays: 365,
      theme: {
        mode: body.theme,
        primary: "#3B82F6",
        secondary: "#10B981",
      },
      recommendWeights: {
        post: 1,
        comment: 0.5,
        timeline: 1.5,
      },
      nameColors: {
        normal: "#64748B",
        active: "#10B981",
        verified: "#3B82F6",
        admin: "#F59E0B",
        owner: "#8B5CF6",
        superadmin: "#EF4444",
      },
      initialized: true, // 添加初始化标记
    };

    // 保存配置到 site_config 表
    await updateSiteConfig(c.env.DB, siteConfig, null); // 初始化时没有管理员用户

    return c.json({
      success: true,
      message: "初始化成功",
      data: { adminUsername: body.adminStudentId },
    });
  } catch (error) {
    console.error("初始化失败:", error);
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