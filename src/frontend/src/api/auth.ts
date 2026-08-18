/**
 * 认证 API（Better Auth，挂载于 /api/auth）
 *
 * Better Auth 响应格式为原生 JSON（非 { success, data } 统一格式），
 * 全部走 requestRaw 透传。注册使用学号作为邮箱（authMethod: student_id）。
 */

import { requestRaw } from "./client";
import type { SessionInfo } from "../types";

// ============================================================
//  学号 → 占位邮箱
//
//  Better Auth 走 email 通道并严格校验邮箱格式，
//  学号本身不是合法邮箱，因此拼接虚拟域名后传输；
//  注册与登录使用同一规则，保证能匹配到同一账号。
// ============================================================

/** 占位邮箱域名（仅用于格式满足，不会发送邮件） */
const STUDENT_EMAIL_DOMAIN = "rippling.local";

/** 学号 → 占位邮箱，如 20240101 → 20240101@rippling.local */
function toStudentEmail(studentId: string): string {
  return `${studentId}@${STUDENT_EMAIL_DOMAIN}`;
}

/** 登录凭证 */
export interface SignInInput {
  /** 学号（注册时即学号） */
  email: string;
  password: string;
}

/** 注册输入 */
export interface SignUpInput {
  /** 用户名 */
  name: string;
  /** 学号（作为登录邮箱） */
  email: string;
  password: string;
}

/**
 * 登录（email + password）
 * Better Auth 成功后通过 Set-Cookie 写入会话 Cookie
 */
export async function signIn(input: SignInInput): Promise<SessionInfo> {
  return requestRaw<SessionInfo>("/api/auth/sign-in/email", "POST", {
    body: { email: toStudentEmail(input.email), password: input.password },
  });
}

/**
 * 注册（用户名 + 学号 + 密码）
 */
export async function signUp(input: SignUpInput): Promise<SessionInfo> {
  return requestRaw<SessionInfo>("/api/auth/sign-up/email", "POST", {
    body: {
      name: input.name,
      email: toStudentEmail(input.email),
      password: input.password,
    },
  });
}

/** 登出（清除会话 Cookie） */
export async function signOut(): Promise<void> {
  // Better Auth 对 POST 强制要求 JSON Content-Type，
  // 因此必须传 body（空对象），否则返回 415
  await requestRaw("/api/auth/sign-out", "POST", { body: {} });
}

/**
 * 获取当前会话（游客返回 null 字段，不抛错）
 */
export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await requestRaw<SessionInfo | null>("/api/auth/get-session", "GET", {
      silentError: true,
    });
  } catch {
    return null;
  }
}

/** 修改密码（Better Auth change-password） */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await requestRaw("/api/auth/change-password", "POST", {
    body: { currentPassword, newPassword, revokeOtherSessions: false },
  });
}
