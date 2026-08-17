/**
 * 设备 ID 工具
 *
 * 首次访问时生成 UUID 并存入 localStorage，之后每次 API 请求
 * 通过 X-Device-ID 请求头携带，用于后端设备指纹 / 主设备管理。
 */

const STORAGE_KEY = "rippling_device_id";

/** 生成 UUID（优先 crypto.randomUUID，旧环境降级为手写 v4） */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 降级方案：RFC 4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 获取设备 ID：localStorage 有则复用，否则生成并持久化
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const deviceId = generateUUID();
    localStorage.setItem(STORAGE_KEY, deviceId);
    return deviceId;
  } catch {
    // localStorage 不可用（隐私模式等）时返回内存临时值
    return generateUUID();
  }
}
