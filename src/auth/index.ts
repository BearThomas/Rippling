/**
 * Better Auth 工厂模块
 *
 * 统一的 auth 实例创建入口，供 auth/[[route]].ts 和 middleware/auth.ts 共享。
 * 使用 withCloudflare 适配器接入 Cloudflare D1（原生模式，无需 Drizzle ORM）。
 */

import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

// ============================================================
//  Cloudflare Pages Functions 环境绑定
// ============================================================

export interface CloudflareEnv {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  ADMIN_STUDENT_ID?: string;
  TRUSTED_ORIGINS?: string;
  REGISTER_QUESTIONS?: string;
  ENCRYPTION_KEY?: string;
  /** Backblaze B2（S3 兼容）配置 */
  B2_BUCKET_NAME?: string;
  B2_ACCESS_KEY_ID?: string;
  B2_SECRET_ACCESS_KEY?: string;
  /** S3 端点，如 https://s3.us-west-000.backblazeb2.com */
  B2_ENDPOINT?: string;
  [key: string]: unknown;
}

// ============================================================
//  工厂函数：创建 Better Auth 实例
//
//  D1 绑定仅在请求内可用，因此 auth 实例必须在每次请求中重新创建。
//  withCloudflare(cf配置, ba配置) 返回合并后的 BetterAuthOptions，
//  再传给 betterAuth() 创建实际的 auth 实例。
// ============================================================

export function createAuth(env: CloudflareEnv) {
  const trustedOrigins = env.TRUSTED_ORIGINS
    ? env.TRUSTED_ORIGINS.split(",").map((s) => s.trim())
    : [];

  return betterAuth(
    withCloudflare(
      {
        // 原生 D1 模式（无需 Drizzle ORM）
        d1Native: env.DB,
        // 关闭自动 IP 检测和地理追踪（我们自己从 CF header 读取）
        autoDetectIpAddress: false,
        geolocationTracking: false,
      },
      {
        // 登录方式：学号（username）+ 密码
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
          minPasswordLength: 8,
        },
        username: {
          enabled: true,
        },
        // Better Auth 默认 session cookie 为 httpOnly + sameSite=lax
        trustedOrigins,
      }
    )
  );
}
