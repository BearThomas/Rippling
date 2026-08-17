<!--
  工单详情页（骨架实现）

  展示工单内容、状态与处理结果；管理员处理操作后续任务完善。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getTicket } from "../api/ticket";
import { formatDateTime } from "../utils/format";
import type { TicketInfo } from "../types";

const route = useRoute();
const ticketId = route.params.id as string;

const loading = ref(true);
const error = ref(false);
const ticket = ref<TicketInfo | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    ticket.value = await getTicket(ticketId);
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
    <ErrorState v-else-if="error" message="工单不存在或无权访问" @retry="load" />

    <template v-else-if="ticket">
      <div class="card-base">
        <!-- 状态行 -->
        <div class="mb-2 flex items-center gap-2 text-xs">
          <span class="text-primary">{{ ticket.type }}</span>
          <span
            class="rounded px-1.5 py-0.5 text-[10px]"
            :class="ticket.status === 'open' ? 'text-accent' : 'bg-line text-ink-soft'"
            :style="ticket.status === 'open' ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
          >
            {{ ticket.status === "open" ? "待处理" : "已关闭" }}
          </span>
          <span class="ml-auto text-ink-soft">{{ formatDateTime(ticket.createdAt) }}</span>
        </div>

        <h2 class="text-lg font-bold">{{ ticket.title }}</h2>
        <p class="mt-2 whitespace-pre-line break-all text-sm leading-relaxed">
          {{ ticket.content ?? "（无正文）" }}
        </p>
      </div>

      <!-- 处理结果 -->
      <div v-if="ticket.result" class="card-base mt-3">
        <h3 class="mb-1 text-sm font-semibold text-ink-soft">处理结果</h3>
        <p class="whitespace-pre-line text-sm">{{ ticket.result }}</p>
      </div>
    </template>
  </div>
</template>
