/**
 * PWA 支持：Service Worker 注册 + 离线状态提示
 *
 * 约定：
 *   - 仅 production 环境注册（开发环境 vite dev 不注册，避免缓存干扰调试）
 *   - 浏览器需支持 navigator.serviceWorker 且页面处于安全上下文
 *   - 在 window load 之后注册，避免与首屏渲染抢占资源
 *   - 注册失败静默降级（不影响正常使用）并输出 console 警告
 */

import { showToast } from "./toast";

/**
 * 注册 Service Worker（生产环境）
 *
 * 在 main.ts 中调用即可，内部自行判断环境与时机。
 */
export function registerServiceWorker(): void {
  // 仅生产环境注册：开发环境不注册，避免缓存干扰调试
  if (!import.meta.env.PROD) return;

  // 浏览器不支持（或非安全上下文）时跳过
  if (!("serviceWorker" in navigator)) return;

  // window load 后注册，避免阻塞首屏
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err: unknown) => {
        // 注册失败不影响应用正常使用，仅记录警告
        console.warn("Service Worker 注册失败：", err);
      });
  });
}

/**
 * 离线状态监听：断网时 Toast 提示，恢复联网时提示已恢复
 *
 * API 请求离线失败由 client.ts 统一错误处理展示；
 * 这里仅做全局网络状态的轻量提示。
 */
export function setupOfflineListener(): void {
  window.addEventListener("offline", () => {
    showToast("当前处于离线状态，仅可查看已缓存内容", "info");
  });
  window.addEventListener("online", () => {
    showToast("网络已恢复", "success", 1500);
  });
}
