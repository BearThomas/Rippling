<!--
  底部导航栏：首页 / 板块 / 应用 / 我的（仅移动端显示，桌面端 lg:hidden）

  高亮由 useRoute 手动计算（不用 RouterLink active-class，
  避免前缀匹配导致首页永远高亮），规则见 utils/navActive.ts。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { resolveActiveNav } from "../../utils/navActive";

/** Tab 配置 */
const TABS = [
  { name: "home", path: "/", label: "首页", icon: "home" },
  { name: "blocks", path: "/blocks", label: "板块", icon: "blocks" },
  { name: "apps", path: "/apps", label: "应用", icon: "apps" },
  { name: "profile", path: "/profile", label: "我的", icon: "user" },
] as const;

type TabName = (typeof TABS)[number]["name"];

const route = useRoute();

const activeTab = computed<TabName | null>(() => resolveActiveNav(route.path));
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-line bg-surface lg:hidden"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="grid grid-cols-4">
      <RouterLink
        v-for="tab in TABS"
        :key="tab.name"
        :to="tab.path"
        class="flex items-center justify-center py-3 text-ink-soft transition-colors"
        :class="{ '!text-primary': activeTab === tab.name }"
        :aria-label="tab.label"
      >
        <AppSvgIcon :name="tab.icon" :size="24" />
      </RouterLink>
    </div>
  </nav>
</template>
