<!--
  大事记页 — 已批准大事记时间线 + 提交入口（骨架实现）

  提交大事记走工单审核（timeline_submit）。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listTimelineEvents } from "../api/timeline";
import { formatDate } from "../utils/format";
import type { TimelineEvent } from "../types";

const loading = ref(true);
const error = ref(false);
const events = ref<TimelineEvent[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    events.value = await listTimelineEvents();
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

    <template v-else>
      <p class="mb-3 text-xs text-ink-soft">
        提交大事记需登录并通过审核，入口见「应用 → 我的工单」。
      </p>

      <!-- 时间线 -->
      <div v-if="events.length > 0" class="relative space-y-4 pl-4">
        <!-- 竖线 -->
        <span class="absolute bottom-2 left-1 top-2 w-px bg-line" aria-hidden="true" />
        <div v-for="event in events" :key="event.id" class="relative">
          <span class="absolute -left-[13px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <p class="text-xs font-medium text-primary">{{ formatDate(event.eventDate) }}</p>
          <div class="card-base mt-1">
            <h3 class="font-semibold">{{ event.title }}</h3>
            <p class="mt-1 whitespace-pre-line text-sm text-ink-soft">{{ event.description }}</p>
          </div>
        </div>
      </div>

      <EmptyState v-else text="还没有大事记" icon="calendar" />
    </template>
  </div>
</template>
