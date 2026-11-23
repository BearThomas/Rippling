<!--
  主布局骨架（DESIGN.md 第 5 节：Elk 响应式三栏 + Memos 副模式画布切换）

  断点策略：
    - 宽屏桌面（>=1280px）：max-w-[1200px] 居中三栏（左 232px + 中 660px 两侧 1px 细边 + 右 272px）
    - 常规桌面（1024px–1279px）：隐藏右栏，左 232px + 中 660px（两侧 1px 细边）
    - 平板端（768px–1023px）：左栏折叠为 68px 纯图标栏，中栏自适应填满
    - 移动端（<768px）：隐藏左右栏，顶栏 52px + 满宽内容区 + 底部 5 Tab 栏

  视觉双模式：
    - 表白墙与提问箱路由自动挂 data-surface="memos"（柔和暖灰画布 --bg-canvas-soft）
    - 其余路由挂 data-surface="elk"（通透主画布 --bg-canvas）
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./AppHeader.vue";
import AppRightRail from "./AppRightRail.vue";
import AppSidebar from "./AppSidebar.vue";
import AppTabbar from "./AppTabbar.vue";
import OnboardingTour from "../onboarding/OnboardingTour.vue";
import { useAuthStore } from "../../stores/auth";
import { buildTourSteps, readTourStatus, startTour } from "../../utils/onboarding";

const MEMOS_ROUTE_NAMES = new Set([
  "confession",
  "confession-detail",
  "question-box",
]);

const route = useRoute();
const auth = useAuthStore();

/** 是否显示移动端底部导航（默认显示；详情/编辑页为 false） */
const showTabbar = computed(() => route.meta.showTabbar !== false);

/** 按当前路由自动识别 Elk / Memos 画布模式（零侵入路由定义） */
const surfaceMode = computed<"elk" | "memos">(() =>
  MEMOS_ROUTE_NAMES.has(String(route.name ?? "")) ? "memos" : "elk"
);

/** 首次使用引导：仅对已登录且未看过的用户自动触发一次 */
async function maybeAutoStart(): Promise<void> {
  if (readTourStatus() !== "unseen") return;
  try {
    const steps = await buildTourSteps();
    if (!steps.length) return;
    startTour(steps);
  } catch {
    // 引导拼装失败时静默忽略，不影响正常使用
  }
}

watch(
  () => auth.loaded,
  (loaded) => {
    if (!loaded || !auth.isLoggedIn) return;
    setTimeout(() => void maybeAutoStart(), 700);
  },
  { immediate: true }
);
</script>

<template>
  <div
    :data-surface="surfaceMode"
    class="min-h-screen min-h-dvh w-full transition-colors"
  >
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-primary focus:px-3.5 focus:py-2 focus:text-xs focus:font-medium focus:text-white"
    >
      跳到主内容
    </a>
    <div class="mx-auto flex min-h-screen min-h-dvh w-full max-w-layout justify-center">
      <!-- 左侧导航（平板 68px 图标栏 / 桌面 232px 完整导航） -->
      <AppSidebar />

      <!-- 中间主栏：桌面锁定最佳阅读宽度 660px，左右极细 1px 边框 -->
      <div
        :data-surface="surfaceMode"
        class="flex min-w-0 flex-1 flex-col transition-colors md:border-l md:border-subtle lg:max-w-feed lg:border-r"
      >
        <AppHeader :surface="surfaceMode" />

        <main
          id="main-content"
          class="flex-1"
          :class="
            showTabbar
              ? 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-8'
              : 'pb-6'
          "
        >
          <RouterView />
        </main>
      </div>

      <!-- 右侧辅助发现区（仅 >=1280px 显示） -->
      <AppRightRail />
    </div>

    <!-- 移动端底部导航（仅 <768px 显示） -->
    <AppTabbar v-if="showTabbar" />

    <!-- 首次使用引导浮层 -->
    <OnboardingTour />
  </div>
</template>
