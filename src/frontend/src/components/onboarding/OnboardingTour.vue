<!--
  首次使用引导（tour）

  行为：
    - 欢迎卡片：可以「跳过」，也可以「开始了解」
    - 每一步：可选先导航到某个路由，再把目标元素挖个洞高亮，卡片贴在旁边
    - 目标元素找不到 → 自动跳过这一条（页面结构变了也不至于卡住）
    - Esc 退出；← → 上一步/下一步；设置页可以重看

  实现：
    - 高亮不用截图、不复制 DOM，只是给目标矩形套一个大阴影当遮罩（1 个元素，开销极低）
    - 位置全部用 getBoundingClientRect 现算，滚动/缩放时重算
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import {
  endTour,
  tourIndex,
  tourOpen,
  tourSteps,
  type TourStep,
} from "../../utils/onboarding";

const router = useRouter();
const route = useRoute();

/** 高亮矩形（视口坐标） */
const hole = ref<{ top: number; left: number; width: number; height: number } | null>(null);
/** 当前高亮的元素（滚动后重新量它） */
const targetEl = ref<HTMLElement | null>(null);
/** 正在为某一步做准备（导航 / 等元素出现） */
const locating = ref(false);

const step = computed<TourStep | null>(() => tourSteps.value[tourIndex.value] ?? null);
const total = computed(() => tourSteps.value.length);
const isFirst = computed(() => tourIndex.value <= 0);
const isLast = computed(() => tourIndex.value >= total.value - 1);
const isWelcome = computed(() => step.value?.id === "welcome");
const isFinish = computed(() => step.value?.id === "finish");
/** 没有高亮目标（或目标已滚动出视口）→ 用居中卡片 */
const centered = computed(() => !step.value?.target || !hole.value);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 等元素出现（SPA 路由切换后 DOM 是异步渲染的） */
async function waitForTarget(selector: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 60; i++) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

/** 量一次高亮矩形 */
function measure(): void {
  const el = targetEl.value;
  if (!el) {
    hole.value = null;
    return;
  }
  const rect = el.getBoundingClientRect();
  // 目标已经滚出视口 → 不给高亮，退化成正中文案，免得不认识的东西在屏幕外
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width === 0) {
    hole.value = null;
    return;
  }
  const pad = 6;
  hole.value = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/** 跳到第 i 步：必要时导航 → 等高亮目标 → 高亮 */
async function goTo(i: number): Promise<void> {
  if (i < 0 || i >= total.value) return;
  tourIndex.value = i;
  hole.value = null;
  targetEl.value = null;

  const current = tourSteps.value[i];
  if (!current) return;

  locating.value = true;
  try {
    if (current.route && route.path !== current.route) {
      await router.push(current.route);
      await sleep(120);
    }
    if (!current.target) return;

    const el = await waitForTarget(current.target);
    if (!el) {
      // 目标不存在：跳过这一条（最后一条就结束）
      if (i < total.value - 1) {
        await goTo(i + 1);
      } else {
        nextOrFinish();
      }
      return;
    }

    targetEl.value = el;
    // 瞬时滚动：平滑滚动会让矩形在动画中途被量到，高亮框会跳
    el.scrollIntoView({ block: "center", behavior: "auto" });
    // 有些页面滚完还会因为图片/内容撑开而挪位置，所以多重试几次
    for (let i = 0; i < 12; i++) {
      await sleep(50);
      measure();
      if (hole.value) break;
    }
  } finally {
    locating.value = false;
  }
}

// ------------------------------------------------------------
//  操作
// ------------------------------------------------------------

function nextOrFinish(): void {
  if (isLast.value) {
    void finish();
    return;
  }
  void goTo(tourIndex.value + 1);
}

function prev(): void {
  void goTo(tourIndex.value - 1);
}

function skip(): void {
  endTour("skipped");
}

async function finish(): Promise<void> {
  endTour("done");
  // 引导最后一步可能在管理面板上，收尾回首页，别把人扔在后台
  if (route.path !== "/") await router.push("/");
}

// ------------------------------------------------------------
//  打开时从第一步开始；关闭时清理
// ------------------------------------------------------------

watch(tourOpen, (open) => {
  if (open) {
    void goTo(0);
  } else {
    hole.value = null;
    targetEl.value = null;
  }
});

// ------------------------------------------------------------
//  滚动 / 缩放 / 键盘
// ------------------------------------------------------------

let rafId = 0;
function onViewportChange(): void {
  if (!tourOpen.value || !targetEl.value) return;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(measure);
}

function onKeydown(event: KeyboardEvent): void {
  if (!tourOpen.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    skip();
  } else if (event.key === "ArrowRight" || event.key === "Enter") {
    event.preventDefault();
    nextOrFinish();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    prev();
  }
}

onMounted(() => {
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
  window.removeEventListener("keydown", onKeydown);
  cancelAnimationFrame(rafId);
});

// ------------------------------------------------------------
//  卡片定位
// ------------------------------------------------------------

const tooltipStyle = computed(() => {
  const h = hole.value;
  if (!h) return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(340, vw - 24);
  const left = Math.min(Math.max(12, h.left + h.width / 2 - width / 2), vw - width - 12);
  const above = h.top > 240;
  const top = above ? h.top - 10 : Math.min(h.top + h.height + 10, vh - 120);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    transform: above ? "translateY(-100%)" : "none",
  };
});
</script>

<template>
  <div v-if="tourOpen && step" class="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
    <!-- 拦截误触：引导期间不让点到底下的页面 -->
    <div class="absolute inset-0" @click.stop />

    <!-- 高亮洞（大阴影把四周压暗，不额外铺一层遮罩） -->
    <div
      v-if="hole"
      class="pointer-events-none absolute z-[101] rounded-xl ring-2 ring-white/70 transition-all duration-200"
      :style="{
        top: `${hole.top}px`,
        left: `${hole.left}px`,
        width: `${hole.width}px`,
        height: `${hole.height}px`,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
      }"
    />
    <div v-else class="absolute inset-0 bg-black/55" />

    <!-- 卡片 -->
    <div
      class="absolute z-[102] rounded-2xl border border-line bg-surface p-4 shadow-2xl"
      :class="
        centered
          ? 'left-1/2 top-1/2 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2'
          : ''
      "
      :style="centered ? {} : tooltipStyle"
    >
      <!-- 头部：进度 + 跳过 -->
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-medium tracking-wide text-primary">
          {{ tourIndex + 1 }} / {{ total }}
        </span>
        <span class="text-xs font-semibold">{{ step.title }}</span>
        <button
          type="button"
          class="ml-auto flex items-center gap-0.5 text-[11px] text-ink-soft active:opacity-70"
          @click="skip"
        >
          跳过
          <AppSvgIcon name="close" :size="12" />
        </button>
      </div>

      <p class="mt-2 text-sm leading-relaxed text-ink-soft">{{ step.body }}</p>

      <!-- 底部：圆点 + 按钮 -->
      <div class="mt-4 flex items-center gap-2">
        <div class="flex flex-1 items-center gap-1">
          <span
            v-for="(s, i) in tourSteps"
            :key="s.id"
            class="h-1.5 rounded-full transition-all"
            :class="i === tourIndex ? 'w-4 bg-primary' : 'w-1.5 bg-line'"
          />
        </div>

        <button
          v-if="isWelcome"
          type="button"
          class="btn-primary !px-3 !py-1.5 text-xs"
          @click="nextOrFinish"
        >
          开始了解
        </button>
        <template v-else-if="isFinish">
          <button type="button" class="btn-primary !px-3 !py-1.5 text-xs" @click="finish">
            完成
          </button>
        </template>
        <template v-else>
          <button
            v-if="!isFirst"
            type="button"
            class="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40"
            :disabled="locating"
            @click="prev"
          >
            上一步
          </button>
          <button
            type="button"
            class="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
            :disabled="locating"
            @click="nextOrFinish"
          >
            {{ locating ? "…" : isLast ? "完成" : "下一步" }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
