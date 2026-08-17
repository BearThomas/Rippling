/**
 * Toast 轻提示工具
 *
 * 纯 DOM 实现（不依赖组件实例），任何地方可直接调用：
 *   showToast("保存成功", "success");
 */

import type { ToastType } from "../types";

/** toast 容器（懒创建，挂在 body 上） */
let container: HTMLDivElement | null = null;

/** 确保容器存在 */
function ensureContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;

  container = document.createElement("div");
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  Object.assign(container.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    pointerEvents: "none",
    width: "100%",
    maxWidth: "480px",
    padding: "0 16px",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);
  return container;
}

/** 各类型对应的背景色 */
const TOAST_COLORS: Record<ToastType, string> = {
  success: "rgba(16, 185, 129, 0.95)",
  error: "rgba(239, 68, 68, 0.95)",
  info: "rgba(17, 24, 39, 0.85)",
};

/**
 * 显示 Toast 提示
 *
 * @param message  提示文本
 * @param type     类型（success / error / info）
 * @param duration 显示时长（毫秒）
 */
export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 2500
): void {
  const parent = ensureContainer();

  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    background: TOAST_COLORS[type],
    color: "#fff",
    fontSize: "14px",
    lineHeight: "1.4",
    padding: "10px 16px",
    borderRadius: "9999px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    maxWidth: "100%",
    overflowWrap: "anywhere",
    opacity: "0",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    transform: "translateY(-8px)",
  } satisfies Partial<CSSStyleDeclaration>);
  parent.appendChild(el);

  // 入场动画
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });

  // 到期淡出并移除
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-8px)";
    window.setTimeout(() => el.remove(), 220);
  }, duration);
}
