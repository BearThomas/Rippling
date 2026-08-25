<!--
  大事记页 — 已审核大事记列表

  - 数据源：GET /api/timeline/list（按 eventDate 倒序，后端已截断描述预览）
  - 分页加载更多
  - 提交大事记走工单：跳转 /ticket/create?type=timeline_submit
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import TimelineCard from "../components/post/TimelineCard.vue";
import { getTimelineList } from "../api/timeline";
import type { TimelineEvent } from "../types";

const router = useRouter();

/** 每页条数（与后端 limit 上限一致） */
const PAGE_SIZE = 20;

const loading = ref(true);
const error = ref(false);
const events = ref<TimelineEvent[]>([]);

/** 分页状态 */
const loadingMore = ref(false);
const hasMore = ref(true);

/** 首次加载 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    events.value = await getTimelineList(PAGE_SIZE, 0);
    hasMore.value = events.value.length >= PAGE_SIZE;
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
    const more = await getTimelineList(PAGE_SIZE, events.value.length);
    events.value = [...events.value, ...more];
    hasMore.value = more.length >= PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

/** 提交大事记 → 工单创建页（timeline_submit 类型） */
function goSubmit(): void {
  router.push({ path: "/ticket/create", query: { type: "timeline_submit" } });
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 顶部操作行：说明 + 提交入口 -->
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-xs text-ink-soft">记录校园重要时刻，提交后需管理员审核。</p>
      <button type="button" class="btn-primary shrink-0 !py-1.5 text-sm" @click="goSubmit">
        提交大事记
      </button>
    </div>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="events.length > 0" class="space-y-3">
        <!-- 复用推荐流大事记卡片（点击进详情，点赞可交互） -->
        <TimelineCard
          v-for="event in events"
          :key="event.id"
          :id="event.id"
          :title="event.title"
          :description="event.description"
          :event-date="event.eventDate"
          :like-count="event.likeCount"
          :created-at="event.createdAt"
        />

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

      <EmptyState v-else text="还没有大事记，来提交第一条" icon="calendar" />
    </template>
  </div>
</template>
