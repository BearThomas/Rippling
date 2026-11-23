<!--
  Elk 风格左侧导航栏（平板 md 折叠为 68px 纯图标栏，桌面 lg 展开为 232px 完整导航）

  - 顶部：站点 Logo + 名称
  - 中部：广场 / 板块 / 表白墙 / 提问箱 / 应用 / 通知（红点）/ 我的 / 管理（按权限显隐）
  - 底部：醒目克制的「发布」主按钮 + 浅/深色快速切换
  - 平板折叠态通过 reka-ui Tooltip 悬停提示名称
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { useRoute, type RouteLocationRaw } from "vue-router";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useAuthStore } from "../../stores/auth";
import { useNotificationStore } from "../../stores/notification";
import { useThemeStore } from "../../stores/theme";
import { getMyPermissions } from "../../utils/myPermissions";
import { resolveActiveSidebarNav, type SidebarNavName } from "../../utils/navActive";
import { hasPermission, PERM_ACCESS_ADMIN_PANEL } from "../../utils/permission";

interface SidebarItem {
  name: SidebarNavName;
  to: RouteLocationRaw;
  label: string;
  icon: string;
  badgeDot?: boolean;
  warmActive?: boolean;
}

const route = useRoute();
const auth = useAuthStore();
const theme = useThemeStore();
const notification = useNotificationStore();

/** 仅在平板与桌面视口（>=768px）挂载侧栏 DOM，避免移动端保留隐藏节点与多余浮层实例 */
const SIDEBAR_QUERY = "(min-width: 768px)";
const isSidebarViewport = shallowRef(
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SIDEBAR_QUERY).matches
    : true
);
let sidebarMql: MediaQueryList | null = null;
function onSidebarMediaChange(event: MediaQueryListEvent): void {
  isSidebarViewport.value = event.matches;
}
onMounted(() => {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    sidebarMql = window.matchMedia(SIDEBAR_QUERY);
    isSidebarViewport.value = sidebarMql.matches;
    sidebarMql.addEventListener("change", onSidebarMediaChange);
  }
});
onBeforeUnmount(() => {
  sidebarMql?.removeEventListener("change", onSidebarMediaChange);
  sidebarMql = null;
});

/** 当前激活的侧栏导航项 */
const activeName = computed<SidebarNavName | null>(() => resolveActiveSidebarNav(route.path));

/** 是否具备管理面板权限 */
const canAdmin = shallowRef(false);

async function probeAdminPermission(): Promise<void> {
  if (!auth.isLoggedIn) {
    canAdmin.value = false;
    return;
  }
  try {
    const mask = await getMyPermissions();
    canAdmin.value = hasPermission(mask, PERM_ACCESS_ADMIN_PANEL);
  } catch {
    canAdmin.value = false;
  }
}

watch(
  () => [auth.loaded, auth.userId] as const,
  ([loaded]) => {
    if (loaded) void probeAdminPermission();
  },
  { immediate: true }
);

/** 提问箱目标路由（已登录跳自己提问箱，游客引导登录） */
const questionBoxTarget = computed<RouteLocationRaw>(() =>
  auth.userId
    ? { name: "question-box", params: { userId: auth.userId } }
    : { path: "/login", query: { redirect: "/profile" } }
);

/** 导航项列表（严格对齐 DESIGN.md 第 5 节） */
const navItems = computed<SidebarItem[]>(() => {
  const list: SidebarItem[] = [
    { name: "home", to: "/", label: "广场", icon: "home" },
    { name: "blocks", to: "/blocks", label: "板块", icon: "blocks" },
    {
      name: "confession",
      to: "/confession",
      label: "表白墙",
      icon: "heart",
      warmActive: true,
    },
    {
      name: "question-box",
      to: questionBoxTarget.value,
      label: "提问箱",
      icon: "helpCircle",
    },
    { name: "apps", to: "/apps", label: "应用", icon: "apps" },
    {
      name: "notifications",
      to: "/notifications",
      label: "通知",
      icon: "bell",
      badgeDot: notification.hasUnread,
    },
    { name: "profile", to: "/profile", label: "我的", icon: "user" },
  ];

  if (canAdmin.value) {
    list.push({ name: "admin", to: "/admin", label: "管理", icon: "shield" });
  }
  return list;
});

/** 当前是否为深色预设 */
const isDark = computed(() => theme.preset === "dark");

/** 快速切换浅色 / 深色（严格走本地主题层，不覆写全站配置） */
function toggleColorMode(): void {
  theme.setPreset(isDark.value ? "light" : "dark");
}

function itemClass(item: SidebarItem): string {
  const isActive = activeName.value === item.name;
  if (!isActive) {
    return "text-ink-secondary hover:bg-hover hover:text-ink";
  }
  if (item.warmActive) {
    return "bg-accent-warm-soft text-accent-warm font-semibold";
  }
  return "bg-accent-soft text-primary font-semibold";
}
</script>

<template>
  <aside
    v-if="isSidebarViewport"
    class="sticky top-0 hidden h-dvh w-[68px] shrink-0 flex-col justify-between px-2.5 py-3 md:flex lg:w-[232px] lg:px-3"
    aria-label="主导航"
  >
    <TooltipProvider :delay-duration="200">
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 顶部 Logo -->
        <RouterLink
          to="/"
          class="mb-3 flex h-11 items-center justify-center gap-2.5 rounded-xl px-2 text-ink transition-colors hover:bg-hover lg:justify-start lg:px-3"
          :aria-label="theme.siteName"
        >
          <img
            v-if="theme.siteIcon"
            :src="theme.siteIcon"
            alt=""
            width="28"
            height="28"
            class="h-7 w-7 shrink-0 rounded-lg object-cover"
          />
          <span
            v-else
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-primary"
          >
            <AppSvgIcon name="compass" :size="18" />
          </span>
          <span class="hidden truncate text-[17px] font-bold tracking-tight text-ink lg:inline">
            {{ theme.siteName }}
          </span>
        </RouterLink>

        <!-- 纵向极简导航项 -->
        <nav class="flex-1 space-y-1 overflow-y-auto scrollbar-none">
          <TooltipRoot v-for="item in navItems" :key="item.name">
            <TooltipTrigger as-child>
              <RouterLink
                :to="item.to"
                class="flex h-11 w-full items-center justify-center gap-3.5 rounded-lg pressable lg:justify-start lg:px-3"
                :class="itemClass(item)"
                :aria-label="item.label"
              >
                <span class="relative flex shrink-0 items-center justify-center">
                  <AppSvgIcon :name="item.icon" :size="21" />
                  <span
                    v-if="item.badgeDot"
                    class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-warm ring-2 ring-[var(--bg-canvas)]"
                  />
                </span>
                <span class="hidden truncate text-[15px] leading-6 lg:inline">
                  {{ item.label }}
                </span>
              </RouterLink>
            </TooltipTrigger>
            <!-- 仅在平板 68px 纯图标模式下展示悬停提示 -->
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="8"
                class="z-50 hidden rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-popover md:block lg:hidden"
              >
                {{ item.label }}
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </nav>
      </div>

      <!-- 底部操作区：发布主按钮 + 浅/深色切换 -->
      <div class="mt-3 shrink-0 space-y-2 border-t border-subtle pt-3">
        <TooltipRoot>
          <TooltipTrigger as-child>
            <RouterLink
              to="/post/create"
              class="btn-primary h-11 w-full !rounded-full !px-0 lg:!px-4"
              aria-label="发布帖子"
            >
              <AppSvgIcon name="penLine" :size="18" class="shrink-0" />
              <span class="hidden text-sm font-semibold lg:inline">发布</span>
            </RouterLink>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              :side-offset="8"
              class="z-50 hidden rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-popover md:block lg:hidden"
            >
              发布
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>

        <TooltipRoot>
          <TooltipTrigger as-child>
            <button
              type="button"
              class="flex h-10 w-full items-center justify-center gap-3 rounded-lg text-ink-secondary hover:bg-hover hover:text-ink pressable lg:justify-start lg:px-3"
              :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
              @click="toggleColorMode"
            >
              <AppSvgIcon :name="isDark ? 'sun' : 'moon'" :size="19" class="shrink-0" />
              <span class="hidden truncate text-sm lg:inline">
                {{ isDark ? "浅色模式" : "深色模式" }}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              :side-offset="8"
              class="z-50 hidden rounded-lg border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-popover md:block lg:hidden"
            >
              {{ isDark ? "浅色模式" : "深色模式" }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>
    </TooltipProvider>
  </aside>
</template>
