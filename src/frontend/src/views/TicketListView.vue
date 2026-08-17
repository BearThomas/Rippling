<!--
  我的工单页 — 工单列表（骨架实现）

  展示当前用户提交的工单，点击进入详情。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getMyTickets } from "../api/ticket";
import { formatRelativeTime } from "../utils/format";
import type { TicketInfo } from "../types";

/** 工单类型中文名 */
const TYPE_LABELS: Record<string, string> = {
  permission_request: "权限申请",
  report: "举报",
  appeal: "申诉",
  verification: "认证",
  block_create: "建板申请",
  account_deletion: "账号注销",
  timeline_submit: "大事记提交",
};

const loading = ref(true);
const error = ref(false);
const tickets = ref<TicketInfo[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    tickets.value = await getMyTickets();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <div v-else-if="tickets.length > 0" class="space-y-3">
      <RouterLink
        v-for="ticket in tickets"
        :key="ticket.id"
        :to="{ name: 'ticket-detail', params: { id: ticket.id } }"
        class="card-base block transition-opacity active:opacity-80"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs text-primary">{{ TYPE_LABELS[ticket.type] ?? ticket.type }}</span>
          <span
            class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
            :class="ticket.status === 'open' ? 'text-accent' : 'bg-line text-ink-soft'"
            :style="ticket.status === 'open' ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
          >
            {{ ticket.status === "open" ? "待处理" : "已关闭" }}
          </span>
        </div>
        <p class="mt-1 truncate text-sm font-medium">{{ ticket.title }}</p>
        <p class="mt-1 text-xs text-ink-soft">{{ formatRelativeTime(ticket.createdAt) }}</p>
      </RouterLink>
    </div>

    <EmptyState v-else text="还没有工单" icon="file" />
  </div>
</template>
