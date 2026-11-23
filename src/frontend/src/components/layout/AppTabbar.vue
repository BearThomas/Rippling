<!--
  移动端底部导航栏（仅 <768px 显示，平板与桌面由 AppSidebar 承载）

  5 项核心入口：广场 / 板块 / 表白墙 / 应用 / 我的
  保留 data-tour="tabbar" 供首次使用引导定位。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useNotificationStore } from "../../stores/notification";
import { resolveActiveNav, type NavTabName } from "../../utils/navActive";

const TABS: ReadonlyArray<{
  name: NavTabName;
  path: string;
  label: string;
  icon: string;
}> = [
  { name: "home", path: "/", label: "广场", icon: "home" },
  { name: "blocks", path: "/blocks", label: "板块", icon: "blocks" },
  { name: "confession", path: "/confession", label: "表白墙", icon: "heart" },
  { name: "apps", path: "/apps", label: "应用", icon: "apps" },
  { name: "profile", path: "/profile", label: "我的", icon: "user" },
];

const route = useRoute();
const notification = useNotificationStore();

const activeTab = computed<NavTabName | null>(() => resolveActiveNav(route.path));

function tabColorClass(name: NavTabName): string {
  if (activeTab.value !== name) return "text-ink-muted";
  return name === "confession" ? "text-accent-warm" : "text-primary";
}
</script>

<template>
  <nav
    data-tour="tabbar"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-subtle backdrop-blur-md md:hidden"
    style="
      background-color: color-mix(in srgb, var(--bg-surface) 92%, transparent);
      padding-bottom: env(safe-area-inset-bottom);
    "
    aria-label="底部导航"
  >
    <div class="grid grid-cols-5">
      <RouterLink
        v-for="tab in TABS"
        :key="tab.name"
        :to="tab.path"
        class="flex flex-col items-center justify-center gap-0.5 py-2 pressable"
        :class="tabColorClass(tab.name)"
        :aria-label="tab.label"
        :aria-current="activeTab === tab.name ? 'page' : undefined"
      >
        <span class="relative flex items-center justify-center">
          <AppSvgIcon :name="tab.icon" :size="20" />
          <span
            v-if="tab.name === 'profile' && notification.hasUnread"
            class="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-warm"
          />
        </span>
        <span class="text-[11px] font-medium leading-4">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
