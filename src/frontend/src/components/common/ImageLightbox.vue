<!--
  图片放大查看灯箱（基于 reka-ui Dialog）

  行为（保持对外 props / emits 完全兼容）：
    - 由 reka-ui Dialog 托管 Portal、焦点陷阱、ESC 关闭与滚动锁定
    - 点图片在「适应屏幕 ↔ 原始尺寸」之间切换（原始尺寸时容器可拖动/滚动）
    - 多图支持左右箭头按钮 + 键盘 ← → 切换 + 页码计数
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
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

const props = withDefaults(
  defineProps<{
    /** 打开状态 */
    open: boolean;
    /** 全部图片地址 */
    urls: string[];
    /** 当前第几张（0 基） */
    index: number;
  }>(),
  { urls: () => [], index: 0 }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update:index", value: number): void;
}>();

/** 是否放大到原始尺寸 */
const zoomed = shallowRef(false);

const current = computed(() => props.urls[props.index] ?? null);
const isVisible = computed(() => props.open && Boolean(current.value));
const hasPrev = computed(() => props.index > 0);
const hasNext = computed(() => props.index < props.urls.length - 1);

function close(): void {
  zoomed.value = false;
  emit("close");
}

function onOpenChange(next: boolean): void {
  if (!next) close();
}

function go(delta: number): void {
  const next = props.index + delta;
  if (next < 0 || next >= props.urls.length) return;
  zoomed.value = false;
  emit("update:index", next);
}

function toggleZoom(): void {
  zoomed.value = !zoomed.value;
}

function onKeydown(event: KeyboardEvent): void {
  if (!isVisible.value) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    go(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    go(-1);
  }
}

watch(
  isVisible,
  (visible) => {
    if (visible) {
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
      zoomed.value = false;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <DialogRoot :open="isVisible" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="overlay-fade fixed inset-0 z-[120] bg-black/95" />
      <DialogContent
        class="fixed inset-0 z-[125] flex flex-col outline-none"
        @click.self="close"
      >
        <DialogTitle class="sr-only">查看大图</DialogTitle>
        <DialogDescription class="sr-only">
          第 {{ index + 1 }} 张，共 {{ urls.length }} 张，点击图片可切换缩放
        </DialogDescription>

        <!-- 顶部：计数 + 关闭 -->
        <div
          class="flex shrink-0 items-center gap-2.5 px-4 py-3 text-white/85"
          style="padding-top: max(0.75rem, env(safe-area-inset-top))"
        >
          <span class="text-xs font-medium tabular-nums">
            {{ index + 1 }} / {{ urls.length }}
          </span>
          <span class="text-xs text-white/45">点击图片切换缩放</span>
          <DialogClose as-child>
            <button
              type="button"
              class="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 pressable"
              aria-label="关闭"
            >
              <AppSvgIcon name="close" :size="18" />
            </button>
          </DialogClose>
        </div>

        <!-- 图片区：未放大时居中适应屏幕；放大后可自由滚动 -->
        <div
          class="relative flex-1 overflow-auto overscroll-contain"
          :class="zoomed ? 'cursor-grab' : 'cursor-zoom-in'"
          @click.self="close"
        >
          <div class="flex min-h-full min-w-full items-center justify-center p-3">
            <img
              v-if="current"
              :src="current"
              alt=""
              class="select-none rounded-lg"
              :class="zoomed ? 'max-w-none' : 'max-h-[calc(100dvh-7.5rem)] max-w-full object-contain'"
              draggable="false"
              @click.stop="toggleZoom"
            />
          </div>
        </div>

        <!-- 左右切换 -->
        <button
          v-if="hasPrev"
          type="button"
          class="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 pressable"
          aria-label="上一张"
          @click.stop="go(-1)"
        >
          <AppSvgIcon name="back" :size="18" />
        </button>
        <button
          v-if="hasNext"
          type="button"
          class="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 pressable"
          aria-label="下一张"
          @click.stop="go(1)"
        >
          <AppSvgIcon name="chevronRight" :size="18" />
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
