<!--
  大事记页 — Elk 无边框时间流
-->
<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import TimelineCard from "../components/post/TimelineCard.vue";
import { getTimelineList } from "../api/timeline";
import type { TimelineEvent } from "../types";

const router = useRouter();
const PAGE_SIZE = 20;

const loading = shallowRef(true);
const error = shallowRef(false);
const events = ref<TimelineEvent[]>([]);

const loadingMore = shallowRef(false);
const hasMore = shallowRef(true);

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

function goSubmit(): void {
  void router.push({ path: "/ticket/create", query: { type: "timeline_submit" } });
}

onMounted(load);
</script>

<template>
  <div class="pb-6">
    <!-- 顶部说明与提交入口 -->
    <div class="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3 sm:px-5">
      <p class="text-xs leading-relaxed text-ink-muted">
        记录校园重要时刻，提交后由管理员审核收录。
      </p>
      <button type="button" class="btn-primary shrink-0 !px-3.5 !py-1.5 text-xs" @click="goSubmit">
        <AppSvgIcon name="plus" :size="14" />
        提交大事记
      </button>
    </div>

    <FeedSkeleton v-if="loading" variant="elk" :count="4" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="events.length > 0">
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

        <div class="py-5 text-center">
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

      <EmptyState
        v-else
        text="还没有大事记"
        description="点击右上角按钮记录第一条校园重要事件。"
        icon="calendar"
      />
    </template>
  </div>
</template>
