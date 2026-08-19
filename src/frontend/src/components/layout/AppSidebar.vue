<!--
  桌面端左侧导航栏（仅 >=1024px 显示，移动端不渲染）

  默认 64px 窄图标栏，鼠标悬停展开为 220px 并显示文字；
  激活项与底部 Tabbar 共用同一套路由归属规则（utils/navActive.ts）。
  底部附设置 / 管理面板入口（管理面板按 access_admin_panel 权限显隐）。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useThemeStore } from "../../stores/theme";
import { getMyPermissions } from "../../utils/myPermissions";
import { hasPermission, PERM_ACCESS_ADMIN_PANEL } from "../../utils/permission";
import { resolveActiveNav } from "../../utils/navActive";

/** 主导航菜单（与底部 Tabbar 一致） */
const MENUS = [
  { name: "home", path: "/", label: "首页", icon: "home" },
  { name: "blocks", path: "/blocks", label: "板块", icon: "blocks" },
  { name: "apps", path: "/apps", label: "应用", icon: "apps" },
  { name: "profile", path: "/profile", label: "我的", icon: "user" },
] as const;

type MenuName = (typeof MENUS)[number]["name"];

const route = useRoute();
const theme = useThemeStore();

/** 激活的导航项（与底部 Tabbar 同一套规则） */
const activeName = computed<MenuName | null>(() => resolveActiveNav(route.path));

/** 设置入口是否处于激活页（/settings） */
const isSettings = computed(() => route.path === "/settings");

/** 管理面板入口是否处于激活页（/admin、/admin-log） */
const isAdminPage = computed(() => route.path === "/admin" || route.path.startsWith("/admin-"));

/** 是否显示管理面板入口（access_admin_panel 权限） */
const canAdmin = ref(false);

onMounted(async () => {
  try {
    const mask = await getMyPermissions();
    canAdmin.value = hasPermission(mask, PERM_ACCESS_ADMIN_PANEL);
  } catch {
    // 权限探测失败（未登录 / 接口异常）时隐藏管理入口
    canAdmin.value = false;
  }
});
</script>

<template>
  <aside
    class="group fixed left-0 top-0 z-50 hidden h-screen w-16 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-200 hover:w-[220px] lg:flex"
    aria-label="主导航"
  >
    <!-- Logo：站点图标（如有）+ 站点名（悬停展开显示） -->
    <RouterLink
      to="/"
      class="flex h-14 shrink-0 items-center gap-2 px-3"
      :title="theme.siteName"
    >
      <img
        v-if="theme.siteIcon"
        :src="theme.siteIcon"
        alt=""
        class="h-7 w-7 shrink-0 rounded-md object-cover"
      />
      <span
        class="truncate whitespace-nowrap text-base font-semibold text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {{ theme.siteName }}
      </span>
    </RouterLink>

    <!-- 主导航 -->
    <nav class="mt-2 flex-1 space-y-1 px-2">
      <RouterLink
        v-for="item in MENUS"
        :key="item.name"
        :to="item.path"
        class="flex h-11 items-center gap-3 rounded-lg px-2.5 transition-colors"
        :class="
          activeName === item.name
            ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary'
            : 'text-ink-soft hover:bg-page hover:text-ink'
        "
        :title="item.label"
      >
        <AppSvgIcon :name="item.icon" :size="22" class="shrink-0" />
        <span
          class="truncate whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          {{ item.label }}
        </span>
      </RouterLink>
    </nav>

    <!-- 底部入口：设置 + 管理面板（按权限显隐） -->
    <div class="shrink-0 space-y-1 border-t border-line p-2">
      <RouterLink
        to="/settings"
        class="flex h-11 items-center gap-3 rounded-lg px-2.5 transition-colors"
        :class="
          isSettings
            ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary'
            : 'text-ink-soft hover:bg-page hover:text-ink'
        "
        title="设置"
      >
        <AppSvgIcon name="settings" :size="22" class="shrink-0" />
        <span
          class="truncate whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          设置
        </span>
      </RouterLink>

      <RouterLink
        v-if="canAdmin"
        to="/admin"
        class="flex h-11 items-center gap-3 rounded-lg px-2.5 transition-colors"
        :class="
          isAdminPage
            ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary'
            : 'text-ink-soft hover:bg-page hover:text-ink'
        "
        title="管理面板"
      >
        <AppSvgIcon name="shield" :size="22" class="shrink-0" />
        <span
          class="truncate whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        >
          管理面板
        </span>
      </RouterLink>
    </div>
  </aside>
</template>
