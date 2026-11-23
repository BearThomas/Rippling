<!--
  通用响应式弹窗 / 底部抽屉（基于 reka-ui Dialog）

  - 移动端（<640px）：贴底弹出 Sheet（rounded-t-xl + safe-area-inset-bottom）
  - 桌面端（>=640px）：居中 Modal（rounded-xl + shadow-popover + 尺寸受控）
  - 内置 Portal、焦点陷阱、ESC 关闭、外部点击关闭与背景滚锁
-->
<script setup lang="ts">
import { computed } from "vue";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import AppSvgIcon from "../layout/AppSvgIcon.vue";

export type DialogSize = "sm" | "md" | "lg" | "xl";

const props = withDefaults(
  defineProps<{
    /** 打开状态（支持 v-model:open） */
    open: boolean;
    /** 弹窗标题 */
    title?: string;
    /** 标题下方辅助说明 */
    description?: string;
    /** 桌面端最大宽度档位 */
    size?: DialogSize;
    /** 是否隐藏右上角关闭按钮 */
    hideClose?: boolean;
    /** 是否允许点击遮罩 / ESC 关闭（提交中可设为 false） */
    dismissible?: boolean;
  }>(),
  {
    title: "",
    description: "",
    size: "md",
    hideClose: false,
    dismissible: true,
  }
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  close: [];
}>();

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

const sizeClass = computed(() => SIZE_CLASSES[props.size] ?? SIZE_CLASSES.md);

function onOpenChange(next: boolean): void {
  if (!next && !props.dismissible) return;
  emit("update:open", next);
  if (!next) emit("close");
}

function onInteractOutside(event: Event): void {
  if (!props.dismissible) event.preventDefault();
}

function onEscapeKeyDown(event: KeyboardEvent): void {
  if (!props.dismissible) event.preventDefault();
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay
        class="overlay-fade fixed inset-0 z-[70]"
        style="background-color: var(--overlay-scrim)"
      />
      <div
        v-if="open"
        class="pointer-events-none fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4"
      >
        <DialogContent
          class="pointer-events-auto panel-pop flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl border border-subtle bg-surface shadow-popover outline-none sm:max-h-[85dvh] sm:rounded-xl"
          :class="sizeClass"
          @pointer-down-outside="onInteractOutside"
          @escape-key-down="onEscapeKeyDown"
        >
          <!-- 标题栏 -->
          <div
            v-if="title || $slots.header || !hideClose"
            class="flex shrink-0 items-start justify-between gap-3 border-b border-subtle px-4 py-3.5 sm:px-5"
          >
            <div class="min-w-0 flex-1">
              <slot name="header">
                <DialogTitle v-if="title" class="truncate text-base font-semibold leading-6 text-ink">
                  {{ title }}
                </DialogTitle>
                <DialogTitle v-else class="sr-only">弹窗</DialogTitle>
                <DialogDescription
                  v-if="description"
                  class="mt-0.5 text-xs leading-relaxed text-ink-muted"
                >
                  {{ description }}
                </DialogDescription>
                <DialogDescription v-else class="sr-only">
                  对话框内容
                </DialogDescription>
              </slot>
            </div>

            <DialogClose v-if="!hideClose" as-child>
              <button
                type="button"
                class="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-hover hover:text-ink pressable"
                :disabled="!dismissible"
                aria-label="关闭"
              >
                <AppSvgIcon name="close" :size="17" />
              </button>
            </DialogClose>
          </div>

          <template v-else>
            <DialogTitle class="sr-only">弹窗</DialogTitle>
            <DialogDescription class="sr-only">对话框内容</DialogDescription>
          </template>

          <!-- 可滚动内容主体 -->
          <div
            class="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
            :style="
              !$slots.footer
                ? { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }
                : undefined
            "
          >
            <slot />
          </div>

          <!-- 可选底部操作栏 -->
          <div
            v-if="$slots.footer"
            class="shrink-0 border-t border-subtle px-4 py-3 sm:px-5"
            style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
          >
            <slot name="footer" />
          </div>
        </DialogContent>
      </div>
    </DialogPortal>
  </DialogRoot>
</template>
