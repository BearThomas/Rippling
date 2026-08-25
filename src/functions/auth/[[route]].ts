/**
 * Better Auth 认证入口
 *
 * 前置验证（注册格式、登录锁定）和后处理（创建 profile、绑定设备）。
 * auth 实例由 src/auth 模块统一创建。
 *
 * 功能：
 *   - 学号注册（username 字段）+ 密码登录
 *   - 注册前验证：学号格式、验证问题、IP 频率限制
 *   - 登录前验证：连续失败 5 次 → 锁定 30 分钟
 *   - 注册成功后自动创建 user_profile（默认权限）
 *   - 登录成功后自动绑定设备
 *
 * ⚠️ 临时方案标注：
 *   - IP 注册频率限制：内存计数（rate-limit.ts）
 *   - 登录失败锁定：内存计数（rate-limit.ts）
 *   - 后续 Task 会替换为 D1 持久化
 */

import type { CloudflareEnv } from "../../auth";
import { createAuth } from "../../auth";
import { checkRateLimit, resetRateLimit } from "../../utils/rate-limit";
import { generateUUID } from "../../utils/uuid";
import { nowISO } from "../../utils/time";
import { DEFAULT_USER_PERMISSIONS } from "../../shared/permissions";
import { getSiteConfig } from "../../db";
import siteConfig from "../../config/site.config.json";

// ============================================================
//  注册自动创建 / 加入年级板块与班级板块
// ============================================================

async function autoJoinGradeAndClassBlocks(
  db: D1Database,
  userId: string,
  studentId: string
): Promise<void> {
  try {
    const dbConfig = await getSiteConfig(db);
    const autoBlock = dbConfig?.autoBlock ?? siteConfig.autoBlock;
    if (!autoBlock) return;

    const now = nowISO();
    const defaultMemberPerms = 4159; // BLOCK_DEFAULT_MEMBER_PERMISSIONS
    const ownerPerms = 32767; // BLOCK_OWNER_PERMISSIONS

    // 查询站长（超级管理员）作为自动创建板块的默认 owner
    const adminRow = await db
      .prepare(
        "SELECT userId FROM user_profile WHERE badge = '站长' ORDER BY createdAt ASC LIMIT 1"
      )
      .first<{ userId: string }>();
    const ownerId = adminRow?.userId ?? userId;

    // 辅助函数：确保板块存在并加入成员
    async function ensureBlockAndJoin(blockName: string, description: string) {
      if (!blockName) return;

      // 1. 查询板块是否存在
      const block = await db
        .prepare("SELECT id FROM block WHERE name = ? AND isDeleted = 0")
        .bind(blockName)
        .first<{ id: string }>();

      let blockId = block?.id;

      // 2. 不存在则创建（以站长作为 ownerId）
      if (!blockId) {
        blockId = generateUUID();
        const placeholderOwner = "__fixed__";
        await db
          .prepare(
            `INSERT INTO block (id, name, description, ownerId, createdAt)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(blockId, blockName, description, placeholderOwner, now)
          .run();

        // 将站长（如果存在）作为 owner 角色加入 block_member
        if (adminRow?.userId) {
          await db
            .prepare(
              `INSERT OR IGNORE INTO block_member (id, blockId, userId, role, permissions, joinedAt)
               VALUES (?, ?, ?, 'owner', ?, ?)`
            )
            .bind(generateUUID(), blockId, adminRow.userId, ownerPerms, now)
            .run();
        }
      }

      // 3. 将新注册用户加入该板块成员（若已存在则忽略）
      await db
        .prepare(
          `INSERT OR IGNORE INTO block_member (id, blockId, userId, role, permissions, joinedAt)
           VALUES (?, ?, ?, 'member', ?, ?)`
        )
        .bind(generateUUID(), blockId, userId, defaultMemberPerms, now)
        .run();
    }

    // 1. 处理年级板块
    if (autoBlock.gradeEnabled) {
      const gStart = (autoBlock.gradeStart ?? 1) - 1;
      const gLen = autoBlock.gradeLength ?? 4;
      if (gStart >= 0 && studentId.length >= gStart + gLen) {
        const gradeCode = studentId.slice(gStart, gStart + gLen);
        if (/^\d+$/.test(gradeCode)) {
          const gNameFormat = autoBlock.gradeNameFormat || "{grade}级年级板";
          const gradeBlockName = gNameFormat.replace(/\{grade\}/g, gradeCode);
          await ensureBlockAndJoin(gradeBlockName, `${gradeCode}级官方年级板块`);
        }
      }
    }

    // 2. 处理班级板块
    if (autoBlock.classEnabled) {
      const gStart = (autoBlock.gradeStart ?? 1) - 1;
      const gLen = autoBlock.gradeLength ?? 4;
      const cStart = (autoBlock.classStart ?? 5) - 1;
      const cLen = autoBlock.classLength ?? 2;
      if (
        gStart >= 0 &&
        cStart >= 0 &&
        studentId.length >= Math.max(gStart + gLen, cStart + cLen)
      ) {
        const gradeCode = studentId.slice(gStart, gStart + gLen);
        const classCode = studentId.slice(cStart, cStart + cLen);
        if (/^\d+$/.test(gradeCode) && /^\d+$/.test(classCode)) {
          const cNameFormat =
            autoBlock.classNameFormat || "{grade}年级{class}班板块";
          const classBlockName = cNameFormat
            .replace(/\{grade\}/g, gradeCode)
            .replace(/\{class\}/g, classCode);
          await ensureBlockAndJoin(
            classBlockName,
            `${gradeCode}级${classCode}班官方班级板块`
          );
        }
      }
    }
  } catch (err) {
    console.error("[Auth] autoJoinGradeAndClassBlocks failed:", err);
  }
}

// ============================================================
//  解析验证问题
// ============================================================

interface RegisterQuestion {
  question: string;
  answer: string;
}

function parseRegisterQuestions(raw?: string): RegisterQuestion[] {
  if (!raw) return [];

  // 环境变量面板 / dotenv 可能保留首尾引号或空白，先清理再解析
  let text = raw.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1);
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      console.error(
        "[Auth] REGISTER_QUESTIONS 解析结果不是 JSON 数组:",
        raw
      );
      return [];
    }
    // 过滤缺 question / answer 的无效项，避免返回空题 / 无效题
    return parsed.filter(
      (item): item is RegisterQuestion =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as RegisterQuestion).question === "string" &&
        (item as RegisterQuestion).question.trim() !== "" &&
        typeof (item as RegisterQuestion).answer === "string"
    );
  } catch (err) {
    // 不再静默吞掉：打印原始值与错误，方便定位配置问题
    console.error(
      "[Auth] REGISTER_QUESTIONS JSON 解析失败:",
      err,
      "raw:",
      raw
    );
    return [];
  }
}

// ============================================================
//  认证请求核心处理（/auth 与 /api/auth 两个入口共用）
// ============================================================

export async function handleAuthRequest(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 前端注册/登录走 email 通道（学号拼进占位邮箱），username 通道保留兼容
  const isSignUp =
    path.endsWith("/sign-up/username") || path.endsWith("/sign-up/email");
  const isSignIn =
    path.endsWith("/sign-in/username") || path.endsWith("/sign-in/email");

  // ----------------------------------------------------------
  //  注册验证问题：随机返回 2 道题（index 为原数组下标，前端提交时回传）
  // ----------------------------------------------------------
  if (request.method === "GET" && path.endsWith("/register-questions")) {
    // 临时调试日志：定位是环境变量未注入，还是 JSON 解析失败
    console.log("REGISTER_QUESTIONS raw:", env.REGISTER_QUESTIONS);
    const registerQuestions = parseRegisterQuestions(env.REGISTER_QUESTIONS);
    console.log("Parsed questions:", registerQuestions);

    // Fisher-Yates 洗牌后取前 2 道（不足 2 道时返回全部）
    const indices = registerQuestions.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const questions = indices
      .slice(0, 2)
      .filter((i) => registerQuestions[i]?.question)
      .map((i) => ({ index: i, question: registerQuestions[i].question }));

    return new Response(
      JSON.stringify({ success: true, data: { questions } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ----------------------------------------------------------
  //  注册：前置验证（在 Better Auth 处理前拦截）
  // ----------------------------------------------------------
  if (isSignUp) {
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;

    if (body) {
      // email 通道时学号存放在邮箱前缀（学号@rippling.local）
      const emailValue = (body.email as string) ?? "";
      const username = (body.username as string) ?? emailValue.split("@")[0];
      const password = (body.password as string) ?? "";
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const studentIdRegex = new RegExp(siteConfig.studentIdPattern);
      const registerQuestions = parseRegisterQuestions(env.REGISTER_QUESTIONS);

      // 1. 学号格式验证（superadmin 学号 00000000 不匹配正则，无法通过普通注册）
      if (!studentIdRegex.test(username)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "VALIDATION_ERROR", message: siteConfig.studentIdHint },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // 2. 密码最小长度
      if (password.length < 8) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "密码至少 8 位" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // 3. 验证问题：配置了 >= 2 道题时强制校验（前端必须提交下标与答案）
      //    缺失 / 下标越界 / 答案不匹配一律返回 400，不允许跳过验证
      if (registerQuestions.length >= 2) {
        const q1 = Number(body.questionIndex1);
        const q2 = Number(body.questionIndex2);
        const a1 = (body.answer1 as string) ?? "";
        const a2 = (body.answer2 as string) ?? "";

        const fieldsMissing =
          body.questionIndex1 === undefined ||
          body.questionIndex2 === undefined ||
          body.answer1 === undefined ||
          body.answer2 === undefined;

        if (
          fieldsMissing ||
          isNaN(q1) || isNaN(q2) ||
          !Number.isInteger(q1) || !Number.isInteger(q2) ||
          q1 < 0 || q1 >= registerQuestions.length ||
          q2 < 0 || q2 >= registerQuestions.length ||
          q1 === q2
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "VALIDATION_ERROR", message: "验证问题答案错误" },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        if (
          a1.trim() !== registerQuestions[q1].answer ||
          a2.trim() !== registerQuestions[q2].answer
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: "VALIDATION_ERROR", message: "验证问题答案错误" },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // 4. IP 注册频率限制（每小时 3 次）⚠️ 临时方案：内存计数
      const rateResult = checkRateLimit(ip, "register", 3600, 3);
      if (rateResult.limited) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "RATE_LIMITED", message: "注册过于频繁，请稍后再试" },
            retryAfter: rateResult.retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(rateResult.retryAfter),
            },
          }
        );
      }
    }
  }

  // ----------------------------------------------------------
  //  登录：锁定检查
  // ----------------------------------------------------------
  if (isSignIn) {
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    // email 通道时从邮箱前缀提取学号
    const username =
      (body?.username as string) ??
      (((body?.email as string) ?? "").split("@")[0]);

    if (username) {
      // 检查是否处于锁定状态（maxCount=0 意味着任何计数都超限）
      const lockCheck = checkRateLimit(`login_lock:${username}`, "login_lock", 1800, 0);
      if (lockCheck.limited) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "RATE_LIMITED",
              message: `登录失败次数过多，请 ${lockCheck.retryAfter} 秒后重试`,
            },
            retryAfter: lockCheck.retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(lockCheck.retryAfter),
            },
          }
        );
      }
    }
  }

  // ----------------------------------------------------------
  //  交给 Better Auth 处理
  // ----------------------------------------------------------
  const auth = createAuth(env);
  const response = await auth.handler(request);

  // ----------------------------------------------------------
  //  注册成功后：创建 user_profile（后处理）
  // ----------------------------------------------------------
  if (isSignUp && response.status < 300) {
    try {
      const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
      const data = (await response.clone().json()) as { user?: { id?: string } };
      const userId = data?.user?.id;

      if (userId) {
        // 用户昵称：优先使用 body.name，为空则用学号作为默认昵称
        // email 通道时学号存放在邮箱前缀
        const username =
          (body?.username as string) ??
          (((body?.email as string) ?? "").split("@")[0]);
        const name = (body?.name as string) ?? "";
        const userDisplayName = name.trim() || username;

        const now = nowISO();
        await env.DB
          .prepare(
            `INSERT INTO user_profile (id, userId, studentId, username, permissions, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            generateUUID(),
            userId,
            username,
            userDisplayName,
            siteConfig.defaultPermissions,
            now,
            now
          )
          .run();

        // 自动创建 / 加入年级板块与班级板块
        await autoJoinGradeAndClassBlocks(env.DB, userId, username);
      }
    } catch (err) {
      console.error("[Auth] Failed to create user_profile after sign-up:", err);
    }
  }

  // ----------------------------------------------------------
  //  登录成功后：绑定设备 + 重置失败计数与锁定
  // ----------------------------------------------------------
  if (isSignIn && response.status < 300) {
    try {
      const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
      const data = (await response.clone().json()) as { user?: { id?: string } };
      const userId = data?.user?.id;
      // email 通道时从邮箱前缀提取学号
      const username =
        (body?.username as string) ??
        (((body?.email as string) ?? "").split("@")[0]);

      if (userId) {
        // 从请求 Header 读取设备 ID，无则生成新的
        let deviceId = request.headers.get("X-Device-ID");
        if (!deviceId) {
          deviceId = generateUUID();
        }

        const now = nowISO();

        // 写入 / 更新 user_device 表
        await env.DB
          .prepare(
            `INSERT INTO user_device (id, userId, deviceId, isMainDevice, lastLoginAt, createdAt)
             VALUES (?, ?, ?, 0, ?, ?)
             ON CONFLICT(userId, deviceId) DO UPDATE SET lastLoginAt = ?`
          )
          .bind(generateUUID(), userId, deviceId, now, now, now)
          .run();

        // 登录成功 → 重置失败计数与锁定状态
        if (username) {
          resetRateLimit(`login_fail:${username}`, "login_fail");
          resetRateLimit(`login_lock:${username}`, "login_lock");
        }
      }
    } catch (err) {
      console.error("[Auth] Failed to bind device after sign-in:", err);
    }
  }

  // ----------------------------------------------------------
  //  登录失败后：记录失败次数，达到上限则锁定
  // ----------------------------------------------------------
  if (isSignIn && response.status >= 400) {
    const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
    // email 通道时从邮箱前缀提取学号
    const username =
      (body?.username as string) ??
      (((body?.email as string) ?? "").split("@")[0]);

    if (username) {
      // 记录失败：30 分钟内 5 次触发锁定
      const failResult = checkRateLimit(`login_fail:${username}`, "login_fail", 1800, 5);

      if (failResult.limited) {
        // 达到 5 次 → 设置锁定（固定 30 分钟，maxCount=0 意味着任何计数都超限）
        checkRateLimit(`login_lock:${username}`, "login_lock", 1800, 0);
      }
    }
  }

  return response;
}

// ============================================================
//  onRequest：Cloudflare Pages Functions 入口
// ============================================================

export const onRequest: PagesFunction<CloudflareEnv> = (context) =>
  handleAuthRequest(context.request, context.env);
