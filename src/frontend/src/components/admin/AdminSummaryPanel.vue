<!--
  管理面板 — 概览子面板

  8 项统计卡片 + 最近 5 条工单（点击进工单详情）。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../common/LoadingSpinner.vue";
import ErrorState from "../common/ErrorState.vue";
import { getAdminSummary } from "../../api/admin";
import type { AdminSummary } from "../../api/admin";
import { ticketTypeLabel, ticketStatusLabel } from "../../utils/ticket";

const loading = ref(true);
const error = ref(false);
const summary = ref<AdminSummary | null>(null);

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

onMounted(load);
</script>

<template>
  <div>
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else-if="summary">
      <!-- 8 项统计卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalUsers }}</p>
          <p class="mt-1 text-xs text-ink-soft">用户</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalPosts }}</p>
          <p class="mt-1 text-xs text-ink-soft">帖子</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalComments }}</p>
          <p class="mt-1 text-xs text-ink-soft">评论</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalConfessions }}</p>
          <p class="mt-1 text-xs text-ink-soft">表白墙</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalTimelineEvents }}</p>
          <p class="mt-1 text-xs text-ink-soft">大事记</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalTickets }}</p>
          <p class="mt-1 text-xs text-ink-soft">工单</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-accent">{{ summary.openTickets }}</p>
          <p class="mt-1 text-xs text-ink-soft">待处理工单</p>
        </div>
        <div class="card-base text-center">
          <p class="text-2xl font-bold text-primary">{{ summary.totalBlocks }}</p>
          <p class="mt-1 text-xs text-ink-soft">板块</p>
        </div>
      </div>

      <!-- 最近工单 -->
      <section class="mt-3">
        <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">最近工单</h3>
        <div v-if="summary.recentTickets.length === 0" class="card-base text-center text-sm text-ink-soft">
          暂无工单
        </div>
        <div v-else class="space-y-3">
          <RouterLink
            v-for="ticket in summary.recentTickets"
            :key="ticket.id"
            :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
            class="card-base block transition-opacity active:opacity-80"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs text-primary">{{ ticketTypeLabel(ticket.type) }}</span>
              <span
                class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
                :class="ticket.status === 'open' ? 'text-accent' : 'bg-line text-ink-soft'"
              >
                {{ ticketStatusLabel(ticket.status) }}
              </span>
            </div>
            <p class="mt-1 truncate text-sm font-medium">{{ ticket.title }}</p>
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
