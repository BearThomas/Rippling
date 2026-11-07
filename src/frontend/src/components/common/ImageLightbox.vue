<!--
  图片放大查看（仅帖子详情页用，帖子流里不启用）

  行为：
    - 全屏黑色遮罩，图片 object-contain 居中
    - 点图片在「适应屏幕 ↔ 原始尺寸」之间切换（原始尺寸时容器可拖动/滚动）
    - 多图：左右箭头 + 计数；键盘 ← → 切换，Esc 关闭
    - 点遮罩、点关闭按钮、按 Esc 都关闭；打开时锁住页面滚动
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
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
const zoomed = ref(false);

const current = computed(() => props.urls[props.index] ?? null);
const hasPrev = computed(() => props.index > 0);
const hasNext = computed(() => props.index < props.urls.length - 1);

function close(): void {
  emit("close");
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
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    go(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    go(-1);
  }
}

/** 打开时锁滚动 + 挂键盘；关闭时还原 */
function bind(open: boolean): void {
  if (open) {
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeydown);
  } else {
    document.body.style.overflow = "";
    window.removeEventListener("keydown", onKeydown);
    zoomed.value = false;
  }
}

watch(() => props.open, bind, { immediate: true });
onBeforeUnmount(() => bind(false));
</script>

<template>
  <div
    v-if="open && current"
    class="fixed inset-0 z-[120] flex flex-col bg-black/95"
    role="dialog"
    aria-modal="true"
    aria-label="查看大图"
    @click.self="close"
  >
    <!-- 顶部：计数 + 关闭 -->
    <div class="flex shrink-0 items-center gap-2 px-4 py-3 text-white/80">
      <span class="text-xs">{{ index + 1 }} / {{ urls.length }}</span>
      <span class="text-[11px] text-white/40">点图切换缩放</span>
      <button
        type="button"
        class="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        aria-label="关闭"
        @click="close"
      >
        <AppSvgIcon name="close" :size="18" />
      </button>
    </div>

    <!-- 图片区：未放大时居中显示；放大后可滚动查看原始尺寸 -->
    <div
      class="relative flex-1 overflow-auto"
      :class="zoomed ? 'cursor-grab' : 'cursor-zoom-in'"
      @click.self="close"
    >
      <div class="flex min-h-full min-w-full items-center justify-center p-2">
        <img
          :src="current"
          alt=""
          class="select-none"
          :class="zoomed ? 'max-w-none' : 'max-h-[calc(100dvh-8rem)] max-w-full object-contain'"
          draggable="false"
          @click.stop="toggleZoom"
        />
      </div>
    </div>

    <!-- 左右切换 -->
    <button
      v-if="hasPrev"
      type="button"
      class="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
      aria-label="上一张"
      @click.stop="go(-1)"
    >
      <AppSvgIcon name="back" :size="18" />
    </button>
    <button
      v-if="hasNext"
      type="button"
      class="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
      aria-label="下一张"
      @click.stop="go(1)"
    >
      <AppSvgIcon name="back" :size="18" class="rotate-180" />
    </button>
  </div>
</template>
