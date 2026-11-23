/**
 * Toast 轻提示工具
 *
 * 纯 DOM 实现（不依赖组件实例），任何地方可直接调用：
 *   showToast("保存成功", "success");
 *
 * 视觉样式直接复用 Design Tokens（--bg-surface / --border-subtle / --text-primary /
 * --c-success / --c-danger / --shadow-popover / --dur-base），浅/深色自动适配并尊重减少动画。
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
  container.setAttribute("aria-atomic", "true");
  Object.assign(container.style, {
    position: "fixed",
    top: "calc(16px + env(safe-area-inset-top, 0px))",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    pointerEvents: "none",
    width: "100%",
    maxWidth: "460px",
    padding: "0 16px",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);
  return container;
}

/** 是否处于减少动态效果状态 */
function isReducedMotion(): boolean {
  const attr = document.documentElement.getAttribute("data-motion");
  if (attr === "reduced") return true;
  if (attr === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** 各类型对应的点色与边框/文字 token */
const TOAST_STYLES: Record<ToastType, { dot: string; border: string }> = {
  success: {
    dot: "var(--c-success)",
    border: "color-mix(in srgb, var(--c-success) 32%, var(--border-subtle))",
  },
  error: {
    dot: "var(--c-danger)",
    border: "color-mix(in srgb, var(--c-danger) 35%, var(--border-subtle))",
  },
  info: {
    dot: "var(--c-primary)",
    border: "var(--border-subtle)",
  },
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
  const reduced = isReducedMotion();
  const palette = TOAST_STYLES[type];

  const el = document.createElement("div");
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "var(--bg-surface)",
    color: "var(--text-primary)",
    border: `1px solid ${palette.border}`,
    fontSize: "13.5px",
    fontWeight: "500",
    lineHeight: "1.45",
    padding: "9px 14px",
    borderRadius: "12px",
    boxShadow: "var(--shadow-popover)",
    maxWidth: "100%",
    overflowWrap: "anywhere",
    opacity: reduced ? "1" : "0",
    transition: reduced
      ? "none"
      : "opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)",
    transform: reduced ? "none" : "translateY(-6px)",
  } satisfies Partial<CSSStyleDeclaration>);

  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  Object.assign(dot.style, {
    width: "7px",
    height: "7px",
    borderRadius: "9999px",
    backgroundColor: palette.dot,
    flexShrink: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  const text = document.createElement("span");
  text.textContent = message;

  el.append(dot, text);
  parent.appendChild(el);

  if (!reduced) {
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }

  window.setTimeout(() => {
    if (reduced) {
      el.remove();
      return;
    }
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    window.setTimeout(() => el.remove(), 220);
  }, duration);
}
