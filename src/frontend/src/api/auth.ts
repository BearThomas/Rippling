/**
 * 认证 API（Better Auth，挂载于 /api/auth）
 *
 * Better Auth 响应格式为原生 JSON（非 { success, data } 统一格式），
 * 全部走 requestRaw 透传。注册使用学号作为邮箱（authMethod: student_id）。
 */

import { ApiError, requestRaw } from "./client";
import type { SessionInfo } from "../types";

// ============================================================
//  认证错误的人话翻译
//
//  Better Auth 返回的是英文（Invalid email or password / User already exists…），
//  直接弹给学生会看不懂。这里按 code 优先、再说一遍关键词兜底。
// ============================================================

/** 错误码 → 中文人话 */
const AUTH_ERROR_TEXT: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "学号或密码不对",
  INVALID_CREDENTIALS: "学号或密码不对",
  USER_NOT_FOUND: "这个学号还没注册过",
  USER_ALREADY_EXISTS: "这个学号已经注册过了，直接登录就行",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "这个学号已经注册过了，直接登录就行",
  INVALID_EMAIL: "学号格式不对",
  PASSWORD_TOO_SHORT: "密码太短（至少 8 位）",
  PASSWORD_TOO_LONG: "密码太长了",
  VALIDATION_ERROR: "填写的内容有问题，请检查后再提交",
  RATE_LIMITED: "操作太频繁，过一会儿再试",
};

/** 英文关键词 → 中文（后端没给 code 时的兜底） */
const AUTH_ERROR_KEYWORDS: [RegExp, string][] = [
  [/invalid email or password|invalid credentials/i, "学号或密码不对"],
  [/already exists|already registered|user_already_exists/i, "这个学号已经注册过了，直接登录就行"],
  [/password.*(too short|at least)/i, "密码太短（至少 8 位）"],
  [/invalid email/i, "学号格式不对"],
  [/user not found/i, "这个学号还没注册过"],
];

/**
 * 把后端 / Better Auth 的错误翻译成能看懂的中文
 *
 * 已经是中文的直接透传（后端的注册前置校验就是中文，写得很具体）。
 */
export function translateAuthError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    const direct = AUTH_ERROR_TEXT[error.code];
    if (direct) return new ApiError(error.code, direct, error.status);

    // 含中文 → 后端自己写好的，原样透传
    if (/[\u4e00-\u9fa5]/.test(error.message)) return error;

    for (const [pattern, text] of AUTH_ERROR_KEYWORDS) {
      if (pattern.test(error.message)) {
        return new ApiError(error.code, text, error.status);
      }
    }
    // 兜底也别把英文原样甩给学生
    return new ApiError(error.code, `操作失败（${error.message}）`, error.status);
  }

  return new ApiError("UNKNOWN", "操作失败，请稍后重试");
}

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
  /** 验证问题下标（原数组下标，由 register-questions 返回） */
  questionIndex1?: number;
  questionIndex2?: number;
  /** 验证问题答案 */
  answer1?: string;
  answer2?: string;
}

/** 注册验证问题项 */
export interface RegisterQuestionItem {
  /** 题目在原数组中的下标（提交注册时需回传） */
  index: number;
  question: string;
}

/**
 * 获取注册验证问题（随机 2 道）
 *
 * 未配置 REGISTER_QUESTIONS 或解析失败时返回空数组，
 * 调用方据此决定是否展示问题区（获取失败静默，不弹 Toast）。
 */
export async function getRegisterQuestions(): Promise<RegisterQuestionItem[]> {
  const payload = await requestRaw<{
    success?: boolean;
    data?: { questions?: RegisterQuestionItem[] };
  }>("/api/auth/register-questions", "GET", { silentError: true });
  return payload?.data?.questions ?? [];
}

/**
 * 登录（email + password）
 * Better Auth 成功后通过 Set-Cookie 写入会话 Cookie
 */
export async function signIn(input: SignInInput): Promise<SessionInfo> {
  try {
    return await requestRaw<SessionInfo>("/api/auth/sign-in/email", "POST", {
      body: { email: toStudentEmail(input.email), password: input.password },
    });
  } catch (error) {
    throw translateAuthError(error);
  }
}

/**
 * 注册（用户名 + 学号 + 密码 + 验证问题）
 */
export async function signUp(input: SignUpInput): Promise<SessionInfo> {
  try {
    return await requestRaw<SessionInfo>("/api/auth/sign-up/email", "POST", {
      body: {
        name: input.name,
        email: toStudentEmail(input.email),
        password: input.password,
        // 验证问题字段为可选，未配置时后端不校验
        questionIndex1: input.questionIndex1,
        questionIndex2: input.questionIndex2,
        answer1: input.answer1,
        answer2: input.answer2,
      },
    });
  } catch (error) {
    throw translateAuthError(error);
  }
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
