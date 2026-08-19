<!--
  顶部标题栏

  根据路由 meta 决定左侧与右侧内容：
    - 首页：站点名 + 搜索入口
    - showBack 页面：返回按钮 + 页面标题
    - 我的页：标题 + 通知红点入口
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useThemeStore } from "../../stores/theme";
import { useNotificationStore } from "../../stores/notification";

const route = useRoute();
const router = useRouter();
const theme = useThemeStore();
const notification = useNotificationStore();

/** 是否显示返回按钮 */
const showBack = computed(() => Boolean(route.meta.showBack));

/** 首页显示搜索入口 */
const isHome = computed(() => route.name === "home");

/** 我的页显示通知入口（带红点） */
const isProfile = computed(() => route.name === "profile");

/** 标题：优先路由 meta.title */
const title = computed(() => (route.meta.title as string) ?? theme.siteName);

/** 返回：优先历史记录，无历史时回首页 */
function goBack(): void {
  if (window.history.state?.back) {
    router.back();
  } else {
    router.push("/");
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-line bg-surface"
  >
    <div class="flex h-12 items-center gap-2 px-3">
      <!-- 左侧：返回按钮或站点名 -->
      <button
        v-if="showBack"
        type="button"
        class="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-page"
        aria-label="返回"
        @click="goBack"
      >
        <AppSvgIcon name="back" :size="20" />
      </button>
      <h1 v-if="isHome" class="flex items-center gap-2 text-lg font-semibold text-primary lg:hidden">
        <img v-if="theme.siteIcon" :src="theme.siteIcon" alt="" class="h-6 w-6 rounded object-cover" />
        {{ theme.siteName }}
      </h1>
      <h1 v-else class="truncate text-base font-semibold">{{ title }}</h1>

      <div class="flex-1" />

      <!-- 右侧：搜索入口（首页） -->
      <RouterLink
        v-if="isHome"
        to="/search"
        class="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft active:bg-page"
        aria-label="搜索"
      >
        <AppSvgIcon name="search" :size="20" />
      </RouterLink>

      <!-- 右侧：通知入口（我的页，带红点） -->
      <RouterLink
        v-if="isProfile"
        to="/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft active:bg-page"
        aria-label="通知"
      >
        <AppSvgIcon name="bell" :size="20" />
        <span
          v-if="notification.hasUnread"
          class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"
        />
      </RouterLink>
    </div>
  </header>
</template>
