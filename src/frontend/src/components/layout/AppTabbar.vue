<!--
  底部导航栏：首页 / 板块 / 应用 / 我的

  高亮由 useRoute 手动计算（不用 RouterLink active-class，
  避免前缀匹配导致首页永远高亮），SVG 线性图标 + 文字。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";

/** Tab 配置 */
const TABS = [
  { name: "home", path: "/", label: "首页", icon: "home" },
  { name: "blocks", path: "/blocks", label: "板块", icon: "blocks" },
  { name: "apps", path: "/apps", label: "应用", icon: "apps" },
  { name: "profile", path: "/profile", label: "我的", icon: "user" },
] as const;

type TabName = (typeof TABS)[number]["name"];

const route = useRoute();

/**
 * 根据当前路径的第一段计算应高亮的 Tab
 *
 * 归属规则：
 *   - 首页：/ 以及帖子 /post/*、评论 /comment/*、搜索 /search、
 *     大事记 /timeline、表白墙 /confession、投票 /vote 等内容流页面
 *   - 板块：/blocks 与板块详情 /block/:id
 *   - 应用：/apps
 *   - 我的：/profile、/user/:id、/settings、/notifications、
 *     提问箱 /question-box/*、工单 /tickets 与 /ticket/*、管理后台 /admin*
 *   - 其余未知路径不高亮任何 Tab
 */
function resolveActiveTab(path: string): TabName | null {
  const top = path.split("/")[1] ?? "";
  switch (top) {
    case "":
    case "home":
    case "post":
    case "comment":
    case "search":
    case "timeline":
    case "confession":
    case "vote":
      return "home";
    case "blocks":
    case "block":
      return "blocks";
    case "apps":
      return "apps";
    case "profile":
    case "user":
    case "settings":
    case "notification":
    case "notifications":
    case "question-box":
    case "tickets":
    case "ticket":
    case "admin":
    case "admin-log":
      return "profile";
    default:
      return null;
  }
}

const activeTab = computed(() => resolveActiveTab(route.path));
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
        :class="{ '!text-primary': activeTab === tab.name }"
      >
        <AppSvgIcon :name="tab.icon" :size="22" />
        <span class="text-[11px] leading-none">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
