/**
 * 全局确认弹窗控制器（配合 ConfirmDialog.vue 使用）
 *
 * 以 Promise 方式渐进替换浏览器原生 window.confirm()：
 *   const ok = await confirmAction({
 *     title: "确定删除这条评论吗？",
 *     description: "删除后不可恢复。",
 *     confirmText: "删除",
 *     variant: "danger",
 *   });
 */

import { readonly, shallowRef } from "vue";

export interface ConfirmOptions {
  /** 弹窗标题（必填） */
  title: string;
  /** 补充说明 */
  description?: string;
  /** 确认按钮文案（默认「确定」） */
  confirmText?: string;
  /** 取消按钮文案（默认「取消」） */
  cancelText?: string;
  /** 样式变体：default 主色 / danger 危险红 */
  variant?: "default" | "danger";
}

interface ResolvedConfirmState {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant: "default" | "danger";
}

const DEFAULT_STATE: ResolvedConfirmState = {
  title: "",
  description: "",
  confirmText: "确定",
  cancelText: "取消",
  variant: "default",
};

const open = shallowRef(false);
const state = shallowRef<ResolvedConfirmState>({ ...DEFAULT_STATE });

let activeResolver: ((result: boolean) => void) | null = null;

function settle(result: boolean): void {
  const resolver = activeResolver;
  activeResolver = null;
  open.value = false;
  if (resolver) resolver(result);
}

/** 打开确认框并等待用户选择 */
export function confirmAction(options: string | ConfirmOptions): Promise<boolean> {
  // 若已有未决确认框，先按取消收口避免悬空 Promise
  if (activeResolver) {
    settle(false);
  }

  const normalized: ConfirmOptions =
    typeof options === "string" ? { title: options } : options;

  state.value = {
    title: normalized.title,
    description: normalized.description ?? "",
    confirmText: normalized.confirmText ?? "确定",
    cancelText: normalized.cancelText ?? "取消",
    variant: normalized.variant ?? "default",
  };
  open.value = true;

  return new Promise<boolean>((resolve) => {
    activeResolver = resolve;
  });
}

/** 供 ConfirmDialog 内部消费的只读状态与回调 */
export function useConfirmDialogState() {
  return {
    open: readonly(open),
    state: readonly(state),
    confirm: () => settle(true),
    cancel: () => settle(false),
    onOpenChange: (next: boolean) => {
      if (!next) settle(false);
    },
  };
}

/** 业务组件便捷调用入口 */
export function useConfirm() {
  return { confirm: confirmAction };
}
