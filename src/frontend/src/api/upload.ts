/**
 * 图片上传 API（/api/upload 与 /api/setup/upload-icon）
 *
 * multipart/form-data 无法走 client.ts 的 JSON 封装，
 * 此处单独封装 fetch 并保持统一的错误处理语义（ApiError + Toast）。
 * 普通图片上传需 upload_image 权限（无权限时后端返回 404）；
 * 初始化向导上传（/api/setup/upload-icon）为公开接口，无需认证。
 */

import { ApiError } from "./client";
import { getDeviceId } from "../utils/deviceId";
import { showToast } from "../utils/toast";

/** 图片大小上限（与后端一致）：2MB */
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/**
 * 上传图片到 B2（通用实现）
 *
 * @param url            上传接口地址
 * @param file           图片文件（jpeg / png / webp / gif，≤2MB）
 * @param includeDevice  是否携带 X-Device-ID（登录态接口需要）
 * @returns 上传后的图片地址（同域代理地址 /api/image?key=...，可直接用于 img src）
 * @throws ApiError 业务错误（已自动 Toast 提示）
 */
async function uploadTo(
  url: string,
  file: File,
  includeDevice: boolean
): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: includeDevice ? { "X-Device-ID": getDeviceId() } : undefined,
      body: formData,
    });
  } catch {
    showToast("网络错误，请稍后重试", "error");
    throw new ApiError("NETWORK_ERROR", "网络错误，请稍后重试");
  }

  let payload: { success?: boolean; data?: { url: string }; error?: { code: string; message: string } };
  try {
    payload = await response.json();
  } catch {
    showToast("响应解析失败", "error");
    throw new ApiError("INVALID_RESPONSE", "响应解析失败", response.status);
  }

  if (!response.ok || payload?.success === false) {
    const message = payload?.error?.message ?? `上传失败（${response.status}）`;
    showToast(message, "error");
    throw new ApiError(payload?.error?.code ?? "UPLOAD_FAILED", message, response.status);
  }

  return payload.data as { url: string };
}

/**
 * 上传图片（登录态，需 upload_image 权限）
 */
export async function uploadImage(file: File): Promise<{ url: string }> {
  return uploadTo("/api/upload/image", file, true);
}

/**
 * 上传站点图标（初始化向导专用，公开接口，仅未初始化时可调用）
 * 后端 B2 未配置时返回友好错误，由 Toast 提示“图床未配置，暂无法上传图标”。
 */
export async function uploadSetupIcon(file: File): Promise<{ url: string }> {
  return uploadTo("/api/setup/upload-icon", file, false);
}
