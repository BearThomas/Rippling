<!--
  Elk 桌面端右侧辅助发现栏（仅 >=1280px 显示）

  结构（严格克制，无花哨统计大卡）：
    1. 顶部轻量搜索框（回车直达 /search?q=...）
    2. 热门板块快速入口（最多 5 条）
    3. 社区大事记摘要（最多 4 条）
    4. 极简底部署名与透明日志链接
-->
<script setup lang="ts">
import { shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "./AppSvgIcon.vue";
import { useDiscoveryRail } from "../../composables/useDiscoveryRail";
import { useThemeStore } from "../../stores/theme";
import { formatDate } from "../../utils/format";

const router = useRouter();
const theme = useThemeStore();
const { blocks, timeline, loading } = useDiscoveryRail();

const searchDraft = shallowRef("");

function submitSearch(): void {
  const q = searchDraft.value.trim();
  if (!q) {
    void router.push({ name: "search" });
    return;
  }
  void router.push({ name: "search", query: { q } });
}
</script>

<template>
  <aside
    class="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col gap-4 overflow-y-auto px-4 py-3 scrollbar-none xl:flex"
    aria-label="辅助发现区"
  >
    <!-- 轻量搜索框 -->
    <form @submit.prevent="submitSearch">
      <div
        class="flex items-center gap-2 rounded-full border border-subtle bg-canvas-soft px-3.5 py-2 transition-colors focus-within:border-primary focus-within:bg-surface"
      >
        <AppSvgIcon name="search" :size="15" class="shrink-0 text-ink-muted" />
        <input
          v-model="searchDraft"
          type="search"
          class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          placeholder="搜索帖子、板块、用户…"
          enterkeyhint="search"
          aria-label="全站搜索"
        />
        <button
          v-if="searchDraft"
          type="button"
          class="shrink-0 text-ink-muted transition-colors hover:text-ink"
          aria-label="清空搜索"
          @click="searchDraft = ''"
        >
          <AppSvgIcon name="close" :size="14" />
        </button>
      </div>
    </form>

    <!-- 热门板块快速入口 -->
    <section
      v-if="blocks.length > 0 || loading"
      class="rounded-xl bg-canvas-soft p-3.5"
    >
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold text-ink-secondary">热门板块</h2>
        <RouterLink
          to="/blocks"
          class="text-xs text-ink-muted transition-colors hover:text-primary"
        >
          全部
        </RouterLink>
      </div>

      <div v-if="loading && blocks.length === 0" class="space-y-2.5 py-1" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="flex items-center justify-between gap-2">
          <div class="skeleton h-3.5 w-28 rounded" />
          <div class="skeleton h-3 w-8 rounded" />
        </div>
      </div>

      <ul v-else class="-mx-1.5 space-y-0.5">
        <li v-for="block in blocks" :key="block.id">
          <RouterLink
            :to="{ name: 'block-detail', params: { id: block.id } }"
            class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink transition-colors hover:bg-hover"
          >
            <span class="flex min-w-0 items-center gap-2">
              <AppSvgIcon name="blocks" :size="14" class="shrink-0 text-ink-muted" />
              <span class="truncate">{{ block.name }}</span>
            </span>
            <span
              v-if="block.memberCount !== undefined"
              class="shrink-0 text-xs tabular-nums text-ink-muted"
            >
              {{ block.memberCount }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- 社区大事记摘要 -->
    <section
      v-if="timeline.length > 0"
      class="rounded-xl bg-canvas-soft p-3.5"
    >
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold text-ink-secondary">社区大事记</h2>
        <RouterLink
          to="/timeline"
          class="text-xs text-ink-muted transition-colors hover:text-primary"
        >
          更多
        </RouterLink>
      </div>

      <ul class="-mx-1.5 space-y-1">
        <li v-for="event in timeline" :key="event.id">
          <RouterLink
            :to="{ name: 'timeline-detail', params: { id: event.id } }"
            class="block rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
          >
            <p class="truncate text-sm font-medium text-ink">{{ event.title }}</p>
            <p class="mt-0.5 text-xs tabular-nums text-ink-muted">
              {{ formatDate(event.eventDate) }}
            </p>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- 极简底部导航 -->
    <footer class="mt-auto px-1 pb-2 text-xs text-ink-muted">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RouterLink to="/apps" class="transition-colors hover:text-ink-secondary">
          应用目录
        </RouterLink>
        <RouterLink to="/admin-log" class="transition-colors hover:text-ink-secondary">
          管理日志
        </RouterLink>
        <RouterLink to="/tickets" class="transition-colors hover:text-ink-secondary">
          工单反馈
        </RouterLink>
      </div>
      <p class="mt-2 text-[11px]">{{ theme.siteName }} · 校园社区</p>
    </footer>
  </aside>
</template>
