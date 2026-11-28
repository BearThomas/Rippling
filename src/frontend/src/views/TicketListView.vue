<!--
  工单列表页 — 我的工单 / 全部工单（Elk 下划线 AppTabs + 无边框分割行）
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { getMyTickets, listTickets } from "../api/ticket";
import { getMyPermissions } from "../utils/myPermissions";
import { hasPermission, PERM_VIEW_TICKET } from "../utils/permission";
import { ticketTypeLabel, ticketStatusLabel } from "../utils/ticket";
import { formatRelativeTime } from "../utils/format";
import type { TicketInfo } from "../types";

const PAGE_SIZE = 20;

type TabKey = "my" | "all";
const activeTab = shallowRef<TabKey>("my");
const canViewAll = shallowRef(false);

const loading = shallowRef(true);
const loadingMore = shallowRef(false);
const error = shallowRef(false);
const tickets = ref<TicketInfo[]>([]);
const hasMore = shallowRef(true);

const tabItems = computed<TabOption[]>(() => {
  const items: TabOption[] = [{ value: "my", label: "我的工单" }];
  if (canViewAll.value) items.push({ value: "all", label: "全部工单" });
  return items;
});

const emptyText = computed(() =>
  activeTab.value === "my" ? "还没有提交过工单" : "暂无工单记录"
);

async function fetchPage(tab: TabKey, offset: number): Promise<TicketInfo[]> {
  if (tab === "all") {
    return listTickets({ limit: PAGE_SIZE, offset });
  }
  return getMyTickets(PAGE_SIZE, offset);
}

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

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchPage(activeTab.value, tickets.value.length);
    tickets.value.push(...page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

function onTabChange(next: string): void {
  const tab: TabKey = next === "all" ? "all" : "my";
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  void load();
}

onMounted(async () => {
  const mask = await getMyPermissions();
  canViewAll.value = hasPermission(mask, PERM_VIEW_TICKET);
  void load();
});
</script>

<template>
  <div>
    <!-- 顶部下划线 Tab（有查看全部权限时展示切换） -->
    <AppTabs
      v-if="canViewAll"
      :model-value="activeTab"
      :items="tabItems"
      variant="underline"
      stretch
      aria-label="工单范围切换"
      @update:model-value="onTabChange"
    />

    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else-if="tickets.length > 0">
      <ul role="list" class="pb-6">
        <li v-for="ticket in tickets" :key="ticket.id">
          <RouterLink
            :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
            class="flex items-start gap-3 border-b border-subtle px-4 py-3.5 hover:bg-hover pressable sm:px-5"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="tag-pill-accent">{{ ticketTypeLabel(ticket.type) }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="
                    ticket.status === 'open'
                      ? 'bg-accent-warm-soft text-accent-warm'
                      : 'bg-hover text-ink-muted'
                  "
                >
                  {{ ticketStatusLabel(ticket.status) }}
                </span>
                <time
                  :datetime="ticket.createdAt"
                  class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
                >
                  {{ formatRelativeTime(ticket.createdAt) }}
                </time>
              </div>
              <p class="mt-1.5 truncate text-[15px] font-medium text-ink">
                {{ ticket.title }}
              </p>
            </div>
            <AppSvgIcon
              name="chevronRight"
              :size="15"
              class="mt-1 shrink-0 text-ink-muted"
            />
          </RouterLink>
        </li>
      </ul>

      <div v-if="hasMore" class="px-4 pb-6 text-center">
        <button
          type="button"
          class="btn-secondary !py-1.5 text-xs"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
      </div>
    </template>

    <div v-else class="px-4 py-6">
      <EmptyState :text="emptyText" icon="file" />
    </div>
  </div>
</template>
