<!--
  主布局：AppHeader + 内容区 + AppTabbar

  移动端优先：内容区限宽 480px 居中，底部导航固定。
  meta.showTabbar === false 的页面（详情页等）隐藏底部导航。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./AppHeader.vue";
import AppTabbar from "./AppTabbar.vue";

const route = useRoute();

/** 是否显示底部导航（默认显示） */
const showTabbar = computed(() => route.meta.showTabbar !== false);
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-app flex-col bg-page">
    <AppHeader />

    <!-- 内容区：为固定底栏预留高度 -->
    <main class="flex-1" :class="showTabbar ? 'pb-16' : 'pb-4'">
      <RouterView />
    </main>

    <AppTabbar v-if="showTabbar" />
  </div>
</template>
