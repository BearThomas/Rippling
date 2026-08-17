<!--
  投票页 — 投票列表（骨架实现）

  创建投票需 create_vote 权限（可通过权限申请工单获取）。
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listVotes } from "../api/vote";
import { formatDate } from "../utils/format";
import type { VoteInfo } from "../types";

const loading = ref(true);
const error = ref(false);
const votes = ref<VoteInfo[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    votes.value = await listVotes();
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

    <div v-else-if="votes.length > 0" class="space-y-3">
      <div v-for="vote in votes" :key="vote.id" class="card-base">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold">{{ vote.title }}</h3>
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
            :class="vote.isClosed ? 'bg-line text-ink-soft' : 'text-accent'"
            :style="!vote.isClosed ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)' } : {}"
          >
            {{ vote.isClosed ? "已结束" : "进行中" }}
          </span>
        </div>
        <p v-if="vote.description" class="mt-1 text-sm text-ink-soft">{{ vote.description }}</p>
        <p class="mt-2 text-xs text-ink-soft">
          截止：{{ formatDate(vote.endAt) }}
          <template v-if="vote.isMultiple"> · 多选</template>
        </p>
      </div>
    </div>

    <EmptyState v-else text="还没有投票" icon="chart" />
  </div>
</template>
