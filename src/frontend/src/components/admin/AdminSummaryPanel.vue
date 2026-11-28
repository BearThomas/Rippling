<!--
  管理面板 — 概览子面板（克制工具页）

  8 项核心指标（极细网格，tabular-nums） + 最近 5 条工单（Elk 分割行）。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import FeedSkeleton from "../common/FeedSkeleton.vue";
import EmptyState from "../common/EmptyState.vue";
import ErrorState from "../common/ErrorState.vue";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { getAdminSummary } from "../../api/admin";
import type { AdminSummary } from "../../api/admin";
import { ticketTypeLabel, ticketStatusLabel } from "../../utils/ticket";

const loading = shallowRef(true);
const error = shallowRef(false);
const summary = ref<AdminSummary | null>(null);

const stats = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { label: "用户", value: s.totalUsers, highlight: false },
    { label: "帖子", value: s.totalPosts, highlight: false },
    { label: "评论", value: s.totalComments, highlight: false },
    { label: "表白墙", value: s.totalConfessions, highlight: false },
    { label: "大事记", value: s.totalTimelineEvents, highlight: false },
    { label: "板块", value: s.totalBlocks, highlight: false },
    { label: "工单总数", value: s.totalTickets, highlight: false },
    { label: "待处理工单", value: s.openTickets, highlight: s.openTickets > 0 },
  ];
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    summary.value = await getAdminSummary();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <FeedSkeleton v-if="loading" variant="elk" :count="4" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else-if="summary">
      <!-- 8 项站点指标（极细 1px 分隔网格，无厚重阴影卡片堆砌） -->
      <section aria-label="站点数据概览" class="border-b border-subtle">
        <dl class="grid grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-4">
          <div
            v-for="item in stats"
            :key="item.label"
            class="bg-canvas px-4 py-4 sm:px-5"
          >
            <dt class="text-xs text-ink-muted">{{ item.label }}</dt>
            <dd
              class="mt-1 text-xl font-bold tabular-nums tracking-tight"
              :class="item.highlight ? 'text-accent-warm' : 'text-ink'"
            >
              {{ item.value }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- 最近工单 -->
      <section class="pt-4">
        <div class="flex items-center justify-between px-4 pb-2 sm:px-5">
          <h2 class="text-sm font-semibold text-ink">最近工单</h2>
          <RouterLink
            to="/tickets"
            class="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            查看全部
          </RouterLink>
        </div>

        <div v-if="summary.recentTickets.length === 0" class="px-4 py-4">
          <EmptyState text="暂无工单记录" icon="file" />
        </div>

        <ul v-else role="list" class="border-t border-subtle">
          <li v-for="ticket in summary.recentTickets" :key="ticket.id">
            <RouterLink
              :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
              class="flex items-center gap-3 border-b border-subtle px-4 py-3 hover:bg-hover pressable sm:px-5"
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
                </div>
                <p class="mt-1 truncate text-sm font-medium text-ink">
                  {{ ticket.title }}
                </p>
              </div>
              <AppSvgIcon name="chevronRight" :size="15" class="shrink-0 text-ink-muted" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
