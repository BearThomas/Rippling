/**
 * 图片上传 API（/api/upload）
 *
 * multipart/form-data 无法走 client.ts 的 JSON 封装，
 * 此处单独封装 fetch 并保持统一的错误处理语义（ApiError + Toast）。
 * 需 upload_image 权限（无权限时后端返回 404）。
 */

import { ApiError } from "./client";
import { getDeviceId } from "../utils/deviceId";
import { showToast } from "../utils/toast";

/** 图片大小上限（与后端一致）：2MB */
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/**
 * 上传图片到 B2
 *
 * @param file 图片文件（jpeg / png / webp / gif，≤2MB）
 * @returns 上传后的公网 URL
 * @throws ApiError 业务错误（已自动 Toast 提示）
 */
export async function uploadImage(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/upload/image", {
      method: "POST",
      credentials: "include",
      headers: { "X-Device-ID": getDeviceId() },
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
