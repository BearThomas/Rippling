/**
 * API 客户端（fetch 封装）
 *
 * 统一约定：
 *   - 自动携带 Cookie（credentials: 'include'）
 *   - 自动携带 X-Device-ID（localStorage 持久化的设备 ID）
 *   - 业务接口统一响应格式 { success: true, data } / { success: false, error }
 *   - 404：提示「资源不存在或无权访问」（后端无权限也返回 404）
 *   - 401：跳转登录页
 *
 * Better Auth 端点（/api/auth/*）响应格式与业务接口不同，
 * 使用 requestRaw 透传原始 JSON。
 */

import { getDeviceId } from "../utils/deviceId";
import { showToast } from "../utils/toast";

/** API 错误（携带后端错误码与 HTTP 状态码） */
export class ApiError extends Error {
  /** 后端错误码（如 UNAUTHORIZED / NOT_FOUND / VALIDATION_ERROR） */
  code: string;
  /** HTTP 状态码（网络错误时为 0） */
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  /** URL 查询参数（undefined / null 值会被过滤） */
  params?: Record<string, string | number | undefined | null>;
  /** JSON 请求体 */
  body?: unknown;
  /** 静默模式：不自动弹 Toast（如会话查询等高频请求） */
  silentError?: boolean;
}

/** 拼接查询字符串 */
function buildQuery(params?: RequestOptions["params"]): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** 401 时跳转登录页（动态 import 避免与 router / store 循环依赖） */
async function redirectToLogin(): Promise<void> {
  try {
    const { default: router } = await import("../router");
    if (router.currentRoute.value.path !== "/login") {
      await router.push({
        path: "/login",
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
  } catch {
    // 路由未就绪时兜底硬跳转
    window.location.href = "/login";
  }
}

/**
 * 原始请求：返回解析后的 JSON（不做统一响应格式解包）
 * 供 Better Auth 等非标准格式端点使用。
 */
export async function requestRaw<T>(
  path: string,
  method: HttpMethod = "GET",
  options: RequestOptions = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${path}${buildQuery(options.params)}`, {
      method,
      credentials: "include",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        "X-Device-ID": getDeviceId(),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "网络错误，请稍后重试");
  }

  // 未登录 → 跳转登录页
  if (response.status === 401) {
    await redirectToLogin();
    throw new ApiError("UNAUTHORIZED", "登录已过期，请重新登录", 401);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("INVALID_RESPONSE", "响应解析失败", response.status);
  }

  if (!response.ok) {
    // Better Auth 错误格式：{ message } / { code, message }
    const err = payload as { message?: string; code?: string };
    throw new ApiError(
      err?.code ?? "REQUEST_FAILED",
      err?.message ?? `请求失败（${response.status}）`,
      response.status
    );
  }

  return payload as T;
}

/**
 * 业务请求：解包统一响应格式 { success, data / error }，直接返回 data
 *
 * @throws ApiError 业务错误 / HTTP 错误
 */
export async function api<T>(
  path: string,
  method: HttpMethod = "GET",
  options: RequestOptions = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${path}${buildQuery(options.params)}`, {
      method,
      credentials: "include",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        "X-Device-ID": getDeviceId(),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    if (!options.silentError) showToast("网络错误，请稍后重试", "error");
    throw new ApiError("NETWORK_ERROR", "网络错误，请稍后重试");
  }

  // 未登录 → 跳转登录页
  if (response.status === 401) {
    await redirectToLogin();
    throw new ApiError("UNAUTHORIZED", "登录已过期，请重新登录", 401);
  }

  let payload: { success?: boolean; data?: T; error?: { code: string; message: string } };
  try {
    payload = await response.json();
  } catch {
    if (!options.silentError) showToast("响应解析失败", "error");
    throw new ApiError("INVALID_RESPONSE", "响应解析失败", response.status);
  }

  // 404：资源不存在或无权限（后端零信任策略）
  if (response.status === 404) {
    const message = payload?.error?.message || "资源不存在或无权访问";
    if (!options.silentError) showToast("资源不存在或无权访问", "error");
    throw new ApiError(payload?.error?.code ?? "NOT_FOUND", message, 404);
  }

  if (!response.ok || payload?.success === false) {
    const message = payload?.error?.message ?? `请求失败（${response.status}）`;
    if (!options.silentError) showToast(message, "error");
    throw new ApiError(payload?.error?.code ?? "REQUEST_FAILED", message, response.status);
  }

  return payload.data as T;
}

/** GET 快捷方法 */
export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return api<T>(path, "GET", options);
}

/** POST 快捷方法 */
export function apiPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return api<T>(path, "POST", { ...options, body });
}

/** PUT 快捷方法 */
export function apiPut<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return api<T>(path, "PUT", { ...options, body });
}

/** DELETE 快捷方法 */
export function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return api<T>(path, "DELETE", options);
}
