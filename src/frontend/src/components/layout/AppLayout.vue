<!--
  主布局：AppSidebar + AppHeader + 内容区 + AppTabbar

  移动端优先：内容区限宽 480px 居中，底部导航固定。
  meta.showTabbar === false 的页面（详情页等）隐藏底部导航。
  桌面端（>=1024px）：隐藏底部导航，显示左侧图标栏（悬停展开），
  主内容区最大宽度 960px 居中（固定侧边栏占位由 lg:pl-16 让出）。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppSidebar from "./AppSidebar.vue";
import AppHeader from "./AppHeader.vue";
import AppTabbar from "./AppTabbar.vue";

const route = useRoute();

/** 是否显示底部导航（默认显示） */
const showTabbar = computed(() => route.meta.showTabbar !== false);
</script>

<template>
  <div
    class="mx-auto flex min-h-screen w-full max-w-app flex-col bg-page lg:max-w-none lg:pl-16"
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
  </div>
</template>
