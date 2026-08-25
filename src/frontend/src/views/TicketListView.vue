<!--
  工单列表页 — 我的工单 / 全部工单（view_ticket 权限）

  - Tab 切换两个数据源，各自独立分页（PAGE_SIZE 条"加载更多"）
  - 每条显示：标题、类型（中文）、状态（中文）、提交时间
  - 点击进入工单详情
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getMyTickets, listTickets } from "../api/ticket";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_VIEW_TICKET } from "../utils/permission";
import { ticketTypeLabel, ticketStatusLabel } from "../utils/ticket";
import { formatRelativeTime } from "../utils/format";
import type { TicketInfo } from "../types";

/** 每页条数 */
const PAGE_SIZE = 20;

/** Tab：我的工单 / 全部工单 */
type TabKey = "my" | "all";
const activeTab = ref<TabKey>("my");

/** 是否具备 view_ticket 权限（决定"全部工单" Tab 是否显示） */
const canViewAll = ref(false);

const loading = ref(true);
const loadingMore = ref(false);
const error = ref(false);
const tickets = ref<TicketInfo[]>([]);
/** 是否还有更多（返回条数不足一页则到底） */
const hasMore = ref(true);

const emptyText = computed(() =>
  activeTab.value === "my" ? "还没有工单" : "暂无工单"
);

/** 拉取指定 Tab 的一页数据 */
async function fetchPage(tab: TabKey, offset: number): Promise<TicketInfo[]> {
  if (tab === "all") {
    return listTickets({ limit: PAGE_SIZE, offset });
  }
  return getMyTickets(PAGE_SIZE, offset);
}

/** 加载第一页（切 Tab / 重试时调用） */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    tickets.value = await fetchPage(activeTab.value, 0);
    hasMore.value = tickets.value.length === PAGE_SIZE;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 加载更多 */
async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchPage(activeTab.value, tickets.value.length);
    tickets.value.push(...page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // 分页失败保留已加载数据，仅 Toast 提示（client 层统一处理）
  } finally {
    loadingMore.value = false;
  }
}

/** 切换 Tab：重置列表并重新加载 */
function switchTab(tab: TabKey): void {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  load();
}

onMounted(async () => {
  // 权限探测：决定是否展示"全部工单" Tab
  const mask = await getMyPermissions();
  canViewAll.value = hasPermission(mask, PERM_VIEW_TICKET);
  load();
});
</script>

<template>
  <div class="px-3 pt-3">
    <!-- Tab 切换 -->
    <div class="mb-3 flex gap-2">
      <button
        type="button"
        class="rounded-full px-4 py-1.5 text-sm transition-colors"
        :class="activeTab === 'my' ? 'bg-primary text-white' : 'bg-surface text-ink-soft'"
        @click="switchTab('my')"
      >
        我的工单
      </button>
      <button
        v-if="canViewAll"
        type="button"
        class="rounded-full px-4 py-1.5 text-sm transition-colors"
        :class="activeTab === 'all' ? 'bg-primary text-white' : 'bg-surface text-ink-soft'"
        @click="switchTab('all')"
      >
        全部工单
      </button>
    </div>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else-if="tickets.length > 0">
      <div class="space-y-3">
        <RouterLink
          v-for="ticket in tickets"
          :key="ticket.id"
          :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
          class="card-base block transition-opacity active:opacity-80"
        >
          <div class="flex items-center gap-2">
            <span class="text-xs text-primary">{{ ticketTypeLabel(ticket.type) }}</span>
            <span
              class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
              :class="ticket.status === 'open' ? 'text-accent' : 'bg-line text-ink-soft'"
              :style="ticket.status === 'open' ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
            >
              {{ ticketStatusLabel(ticket.status) }}
            </span>
          </div>
          <p class="mt-1 truncate text-sm font-medium">{{ ticket.title }}</p>
          <p class="mt-1 text-xs text-ink-soft">{{ formatRelativeTime(ticket.createdAt) }}</p>
        </RouterLink>
      </div>

      <!-- 加载更多 -->
      <button
        v-if="hasMore"
        type="button"
        class="btn-secondary mt-3 w-full"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? "加载中…" : "加载更多" }}
      </button>
    </template>

    <EmptyState v-else :text="emptyText" icon="file" />
  </div>
</template>
