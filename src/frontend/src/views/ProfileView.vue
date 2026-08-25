<!--
  我的页 — 个人中心（骨架实现）

  未登录显示登录引导；已登录显示用户名与功能入口。
  通知红点入口在 AppHeader（profile 路由时显示）。
-->
<script setup lang="ts">
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { useAuthStore } from "../stores/auth";
import { showToast } from "../utils/toast";

const router = useRouter();
const auth = useAuthStore();

/** 功能入口（占位，后续任务补充资料页等） */
const MENUS = [
  { label: "我的工单", icon: "file", to: "/tickets" },
  { label: "设置", icon: "sliders", to: "/settings" },
  { label: "管理面板", icon: "shield", to: "/admin" },
] as const;

/** 登出 */
async function handleSignOut(): Promise<void> {
  await auth.signOut();
  showToast("已退出登录", "success");
  router.push("/login");
}
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 未登录：登录引导 -->
    <div v-if="auth.loaded && !auth.isLoggedIn" class="card-base text-center">
      <p class="mb-4 text-sm text-ink-soft">登录后体验完整功能</p>
      <RouterLink to="/login" class="btn-primary w-full">登录 / 注册</RouterLink>
    </div>

    <!-- 已登录：用户信息 -->
    <div v-else class="card-base flex items-center gap-3">
      <span
        class="flex h-12 w-12 items-center justify-center rounded-full text-white"
        style="background: var(--c-primary)"
      >
        <AppSvgIcon name="user" :size="24" />
      </span>
      <div class="min-w-0">
        <p class="truncate font-semibold">{{ auth.username ?? "用户" }}</p>
        <p class="text-xs text-ink-soft">欢迎回到 Rippling</p>
      </div>
    </div>

    <!-- 功能入口 -->
    <div class="mt-3 space-y-3">
      <RouterLink
        v-for="menu in MENUS"
        :key="menu.label"
        :to="menu.to"
        class="card-base flex items-center gap-3 py-3 transition-opacity active:opacity-80"
      >
        <AppSvgIcon :name="menu.icon" :size="18" class="text-ink-soft" />
        <span class="flex-1 text-sm">{{ menu.label }}</span>
        <AppSvgIcon name="back" :size="16" class="rotate-180 text-ink-soft" />
      </RouterLink>
    </div>

    <!-- 登出 -->
    <button
      v-if="auth.isLoggedIn"
      type="button"
      class="btn-secondary mt-3 w-full text-red-500"
      @click="handleSignOut"
    >
      退出登录
    </button>
  </div>
</template>
