<!--
  中栏吸顶半透明顶栏（52px）

  特点：
    - 贴合中栏宽度，backdrop-blur-md + 1px 底部分割线
    - 随 Elk / Memos 视觉模式自动匹配半透明底色
    - 左侧：返回按钮或当前页标题（18px/24px font-semibold）
    - 右侧：首页搜索入口（保留 data-tour="header-search"）、移动端通知红点入口
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useAuthStore } from "../../stores/auth";
import { useNotificationStore } from "../../stores/notification";
import { useThemeStore } from "../../stores/theme";

const props = withDefaults(
  defineProps<{
    surface?: "elk" | "memos";
  }>(),
  { surface: "elk" }
);

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();
const notification = useNotificationStore();

const showBack = computed(() => Boolean(route.meta.showBack));
const isHome = computed(() => route.name === "home");
const isProfile = computed(() => route.name === "profile");
const isNotifications = computed(() => route.name === "notifications");

/** 标题：首页桌面端展示「广场」，其余页取路由 meta.title */
const title = computed(() => {
  if (isHome.value) return "广场";
  return (route.meta.title as string) ?? theme.siteName;
});

/** 半透明毛玻璃顶栏背景：跟随主画布（Elk）或柔和画布（Memos） */
const headerBgStyle = computed(() => ({
  backgroundColor:
    props.surface === "memos"
      ? "color-mix(in srgb, var(--bg-canvas-soft) 86%, transparent)"
      : "color-mix(in srgb, var(--bg-canvas) 84%, transparent)",
}));

function goBack(): void {
  if (window.history.state?.back) {
    router.back();
  } else {
    void router.push("/");
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-subtle backdrop-blur-md"
    :style="headerBgStyle"
  >
    <div class="flex h-[52px] items-center gap-2 px-3 sm:px-5">
      <!-- 返回按钮 -->
      <button
        v-if="showBack"
        type="button"
        class="-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-hover pressable"
        aria-label="返回"
        @click="goBack"
      >
        <AppSvgIcon name="back" :size="20" />
      </button>

      <!-- 首页：移动端展示站点标识，平板/桌面展示「广场」 -->
      <template v-if="isHome">
        <h1 class="flex min-w-0 items-center gap-2 text-[18px] font-semibold leading-6 text-ink md:hidden">
          <img
            v-if="theme.siteIcon"
            :src="theme.siteIcon"
            alt=""
            width="24"
            height="24"
            class="h-6 w-6 shrink-0 rounded-md object-cover"
          />
          <span class="truncate">{{ theme.siteName }}</span>
        </h1>
        <h1 class="hidden truncate text-[18px] font-semibold leading-6 text-ink md:block">
          {{ title }}
        </h1>
      </template>

      <!-- 其余页面标题 -->
      <h1 v-else class="truncate text-[18px] font-semibold leading-6 text-ink">
        {{ title }}
      </h1>

      <div class="flex-1" />

      <!-- 右侧：首页搜索入口（保留 data-tour="header-search" 供使用引导定位） -->
      <RouterLink
        v-if="isHome"
        to="/search"
        data-tour="header-search"
        class="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-hover hover:text-ink pressable"
        aria-label="搜索"
      >
        <AppSvgIcon name="search" :size="19" />
      </RouterLink>

      <!-- 右侧：通知入口（我的页全端展示；首页移动端登录态展示） -->
      <RouterLink
        v-if="(isProfile || (isHome && auth.isLoggedIn)) && !isNotifications"
        to="/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-hover hover:text-ink pressable"
        :class="isHome ? 'md:hidden' : ''"
        aria-label="通知"
      >
        <AppSvgIcon name="bell" :size="19" />
        <span
          v-if="notification.hasUnread"
          class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-warm"
        />
      </RouterLink>
    </div>
  </header>
</template>
