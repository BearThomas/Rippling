<!--
  主布局：AppSidebar + AppHeader + 内容区 + AppTabbar

  移动端优先：内容区限宽 480px 居中，底部导航固定。
  meta.showTabbar === false 的页面（详情页等）隐藏底部导航。
  桌面端（>=1024px）：隐藏底部导航，显示左侧图标栏（悬停展开），
  主内容区最大宽度 960px 居中（固定侧边栏占位由 lg:pl-16 让出）。
-->
<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import AppSidebar from "./AppSidebar.vue";
import AppHeader from "./AppHeader.vue";
import AppTabbar from "./AppTabbar.vue";
import OnboardingTour from "../onboarding/OnboardingTour.vue";
import { useAuthStore } from "../../stores/auth";
import { buildTourSteps, readTourStatus, startTour } from "../../utils/onboarding";

const route = useRoute();
const auth = useAuthStore();

/** 是否显示底部导航（默认显示） */
const showTabbar = computed(() => route.meta.showTabbar !== false);

/**
 * 首次使用引导：只对已登录用户、且还从没看过的人自动弹一次。
 * 跳过或走完都会记进 localStorage，不再打扰（设置页可以重看）。
 */
async function maybeAutoStart(): Promise<void> {
  if (readTourStatus() !== "unseen") return;
  try {
    const steps = await buildTourSteps();
    if (!steps.length) return;
    startTour(steps);
  } catch {
    // 引导拼装失败就当没这回事，不影响正常使用
  }
}

watch(
  () => auth.loaded,
  (loaded) => {
    if (!loaded || !auth.isLoggedIn) return;
    // 稍等一下，让首页内容先出来，第一步落在首页上更自然
    setTimeout(() => void maybeAutoStart(), 700);
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="mx-auto flex min-h-screen min-h-dvh w-full max-w-app flex-col bg-page lg:max-w-none lg:pl-16"
  >
    <!-- 桌面端左侧导航（fixed，移动端不渲染） -->
    <AppSidebar />

    <AppHeader />

    <!-- 内容区：移动端为固定底栏预留高度，桌面端留 24px -->
    <main class="flex-1" :class="showTabbar ? 'pb-16 lg:pb-6' : 'pb-4'">
      <!-- 桌面端内容容器：960px 居中 + 左右 24px 留白 -->
      <div class="mx-auto w-full lg:max-w-[960px] lg:px-6">
        <RouterView />
      </div>
    </main>

    <AppTabbar v-if="showTabbar" />

    <!-- 首次使用引导（浮层，不影响布局） -->
    <OnboardingTour />
  </div>
</template>
