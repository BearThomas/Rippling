<!--
  管理日志页（/admin-log）

  - 数据源：GET /api/admin-log/list（完全公开，无需登录 / 权限）
  - 每条显示：管理员用户名 / 操作 action / 目标类型 / 目标 ID / 时间
  - detail 可折叠展开
  - 分页加载更多
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { listAdminLogs } from "../api/adminLog";
import { formatDateTime } from "../utils/format";
import type { AdminLogInfo } from "../types";

/** 每页条数 */
const PAGE_SIZE = 30;

const loading = ref(true);
const error = ref(false);
const logs = ref<AdminLogInfo[]>([]);

/** 分页状态 */
const loadingMore = ref(false);
const hasMore = ref(true);

/** detail 展开状态（日志 ID 集合） */
const expanded = ref<Set<string>>(new Set());

/** 首次加载 */
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

/** 加载更多 */
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

/** 切换 detail 折叠状态 */
function toggleDetail(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expanded.value = next;
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <p class="mb-3 text-xs text-ink-soft">管理操作记录完全公开，接受所有用户监督。</p>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="logs.length > 0" class="space-y-3">
        <article v-for="log in logs" :key="log.id" class="card-base">
          <!-- 管理员 + 操作 -->
          <div class="flex items-center gap-2">
            <span class="flex items-center gap-1 text-sm font-medium text-primary">
              <AppSvgIcon name="shield" :size="14" />
              {{ log.adminUsername ?? "系统" }}
            </span>
            <span class="rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1.5 py-0.5 text-[11px] text-primary">
              {{ log.action }}
            </span>
            <span class="ml-auto shrink-0 text-[11px] text-ink-soft">
              {{ formatDateTime(log.createdAt) }}
            </span>
          </div>

          <!-- 目标 -->
          <p class="mt-2 text-xs text-ink-soft">
            目标类型：<span class="text-ink">{{ log.targetType }}</span>
            <template v-if="log.targetId">
              · 目标 ID：<span class="break-all text-ink">{{ log.targetId }}</span>
            </template>
          </p>

          <!-- detail（可折叠） -->
          <div v-if="log.detail" class="mt-2">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-primary"
              @click="toggleDetail(log.id)"
            >
              <AppSvgIcon :name="expanded.has(log.id) ? 'chevronUp' : 'chevronDown'" :size="13" />
              {{ expanded.has(log.id) ? "收起详情" : "查看详情" }}
            </button>
            <pre
              v-if="expanded.has(log.id)"
              class="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-page px-3 py-2 text-xs text-ink-soft"
            >{{ log.detail }}</pre>
          </div>
        </article>

        <!-- 加载更多 -->
        <div class="py-2 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-1.5 text-sm"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-soft">已经到底啦</span>
        </div>
      </div>

      <EmptyState v-else text="暂无管理日志" icon="shield" />
    </template>
  </div>
</template>
