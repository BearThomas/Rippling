<!--
  底部导航栏：首页 / 板块 / 应用 / 我的

  使用 RouterLink 激活态高亮，SVG 线性图标 + 文字。
-->
<script setup lang="ts">
import AppSvgIcon from "./AppSvgIcon.vue";

/** Tab 配置 */
const TABS = [
  { name: "home", path: "/", label: "首页", icon: "home" },
  { name: "blocks", path: "/blocks", label: "板块", icon: "blocks" },
  { name: "apps", path: "/apps", label: "应用", icon: "apps" },
  { name: "profile", path: "/profile", label: "我的", icon: "user" },
] as const;
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-line bg-surface"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="grid grid-cols-4">
      <RouterLink
        v-for="tab in TABS"
        :key="tab.name"
        :to="tab.path"
        class="flex flex-col items-center gap-0.5 py-2 text-ink-soft transition-colors"
        active-class="!text-primary"
      >
        <AppSvgIcon :name="tab.icon" :size="22" />
        <span class="text-[11px] leading-none">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
