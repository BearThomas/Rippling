<!--
  管理日志页（/admin-log — Elk 紧凑分割行 + Collapse 详情折叠）
-->
<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import Collapse from "../components/common/Collapse.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listAdminLogs } from "../api/adminLog";
import { formatDateTime } from "../utils/format";
import type { AdminLogInfo } from "../types";

const PAGE_SIZE = 30;

const loading = shallowRef(true);
const error = shallowRef(false);
const logs = ref<AdminLogInfo[]>([]);
const loadingMore = shallowRef(false);
const hasMore = shallowRef(true);

const expanded = ref<Set<string>>(new Set());

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    logs.value = await listAdminLogs({ limit: PAGE_SIZE, offset: 0 });
    hasMore.value = logs.value.length >= PAGE_SIZE;
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
    const more = await listAdminLogs({ limit: PAGE_SIZE, offset: logs.value.length });
    logs.value = [...logs.value, ...more];
    hasMore.value = more.length >= PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

function toggleDetail(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expanded.value = next;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <p class="border-b border-subtle bg-canvas-soft px-4 py-2.5 text-xs text-ink-muted sm:px-5">
      管理操作记录完全公开，接受所有用户监督。
    </p>

    <FeedSkeleton v-if="loading" variant="elk" :count="6" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else>
      <div v-if="logs.length > 0" class="pb-8">
        <article
          v-for="log in logs"
          :key="log.id"
          class="border-b border-subtle px-4 py-3.5 sm:px-5"
        >
          <!-- 管理员 + 操作 + 时间 -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <AppSvgIcon name="shield" :size="14" class="text-primary" />
              <span>{{ log.adminUsername ?? "系统" }}</span>
            </span>
            <span class="tag-pill-accent font-mono text-[11px]">
              {{ log.action }}
            </span>
            <time
              :datetime="log.createdAt"
              class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
            >
              {{ formatDateTime(log.createdAt) }}
            </time>
          </div>

          <!-- 目标 -->
          <p class="mt-1.5 text-xs text-ink-muted">
            目标类型：<span class="font-medium text-ink-secondary">{{ log.targetType }}</span>
            <template v-if="log.targetId">
              <span aria-hidden="true"> · </span>
              目标 ID：<span class="font-mono break-all text-ink-secondary">{{ log.targetId }}</span>
            </template>
          </p>

          <!-- 详情折叠（使用 Collapse .disclosure） -->
          <div v-if="log.detail" class="mt-2">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md py-0.5 text-xs font-medium text-primary hover:underline underline-offset-4 pressable"
              :aria-expanded="expanded.has(log.id)"
              @click="toggleDetail(log.id)"
            >
              <AppSvgIcon
                :name="expanded.has(log.id) ? 'chevronUp' : 'chevronDown'"
                :size="13"
              />
              <span>{{ expanded.has(log.id) ? "收起详情" : "查看详情" }}</span>
            </button>
            <Collapse :open="expanded.has(log.id)">
              <pre
                class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-canvas-soft px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-secondary"
              >{{ log.detail }}</pre>
            </Collapse>
          </div>
        </article>

        <!-- 加载更多 -->
        <div class="py-4 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-muted">已经到底啦</span>
        </div>
      </div>

      <div v-else class="px-4 py-6">
        <EmptyState text="暂无管理日志" icon="shield" />
      </div>
    </template>
  </div>
</template>
