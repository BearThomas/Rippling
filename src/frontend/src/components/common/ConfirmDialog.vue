<!--
  全局确认弹窗（基于 reka-ui AlertDialog）

  挂载在 App.vue 根节点，由 composables/useConfirm.ts 驱动。
  自带 Portal、焦点陷阱、ESC 关闭与滚动锁定。
-->
<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { useConfirmDialogState } from "../../composables/useConfirm";

const { open, state, confirm, cancel, onOpenChange } = useConfirmDialogState();
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay
        class="overlay-fade fixed inset-0 z-[90]"
        style="background-color: var(--overlay-scrim)"
      />
      <AlertDialogContent
        class="pointer-events-none panel-pop fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4"
        @pointer-down-outside.prevent
      >
        <div
          class="pointer-events-auto w-full rounded-t-xl border border-subtle bg-surface p-5 shadow-popover sm:max-w-sm sm:rounded-xl"
          style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
        >
          <div class="flex items-start gap-3">
            <span
              v-if="state.variant === 'danger'"
              class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <AppSvgIcon name="alertTriangle" :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <AlertDialogTitle class="text-base font-semibold leading-6 text-ink">
                {{ state.title }}
              </AlertDialogTitle>
              <AlertDialogDescription
                v-if="state.description"
                class="mt-1.5 text-sm leading-relaxed text-ink-secondary"
              >
                {{ state.description }}
              </AlertDialogDescription>
              <AlertDialogDescription v-else class="sr-only">
                请确认是否继续执行此操作
              </AlertDialogDescription>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-end gap-2.5">
            <AlertDialogCancel as-child>
              <button
                type="button"
                class="btn-secondary flex-1 sm:flex-none"
                @click="cancel"
              >
                {{ state.cancelText }}
              </button>
            </AlertDialogCancel>
            <AlertDialogAction as-child>
              <button
                type="button"
                class="flex-1 sm:flex-none"
                :class="
                  state.variant === 'danger'
                    ? 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-white pressable hover:opacity-90'
                    : 'btn-primary'
                "
                @click="confirm"
              >
                {{ state.confirmText }}
              </button>
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
