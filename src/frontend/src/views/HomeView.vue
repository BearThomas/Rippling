<!--
  首页 — Elk 无边框推荐流

  功能：
    - /api/recommend 游标分页拉取（第一页含置顶）
    - 置顶区：可折叠（保留 Collapse .disclosure 与 data-tour="home-pinned"）
    - 多类型信息流分发（帖子 / 表白墙 / 大事记 / 投票，1px 分割线分隔）
    - IntersectionObserver 无限滚动（防重复加载 + 失败重试）
    - 移动端右下角悬浮发帖按钮（md:hidden，平板/桌面由左栏「发布」承担）
-->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import FeedItem from "../components/post/FeedItem.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import Collapse from "../components/common/Collapse.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getRecommendFeed } from "../api/recommend";
import { setTourFirstPostId } from "../utils/onboarding";
import { readFeedSnapshot, writeFeedSnapshot } from "../utils/feedCache";
import { useAuthStore } from "../stores/auth";
import type { PinnedItemInfo, RecommendItem } from "../types";

const router = useRouter();
const auth = useAuthStore();

/** 已查看置顶 ID 的 localStorage 键 */
const VIEWED_PINNED_KEY = "rippling.viewedPinned";

const loading = shallowRef(true);
const error = shallowRef(false);

const pinned = ref<PinnedItemInfo[]>([]);
const items = ref<RecommendItem[]>([]);
const nextCursor = ref<{ lastScore: number; lastId: string } | null>(null);

const loadingMore = shallowRef(false);
const loadMoreError = shallowRef(false);

const pinnedCollapsed = shallowRef(false);
const pinnedTouched = shallowRef(false);

const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function readViewedPinned(): string[] {
  try {
    const raw = localStorage.getItem(VIEWED_PINNED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markPinnedViewed(targetId: string): void {
  const viewed = new Set(readViewedPinned());
  if (viewed.has(targetId)) return;
  viewed.add(targetId);
  try {
    const list = [...viewed].slice(-100);
    localStorage.setItem(VIEWED_PINNED_KEY, JSON.stringify(list));
  } catch {
    // 存储不可用时忽略
  }
}

async function loadFeed(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  error.value = false;
  loadMoreError.value = false;
  try {
    const feed = await getRecommendFeed();
    pinned.value = feed.pinned ?? [];
    items.value = feed.items ?? [];
    nextCursor.value = feed.nextCursor;
    writeFeedSnapshot(auth.userId ?? null, {
      pinned: pinned.value,
      items: items.value,
      nextCursor: nextCursor.value,
    });
    const firstPost = items.value.find((item) => item.type === "post");
    setTourFirstPostId(firstPost ? firstPost.id : null);
    if (!pinnedTouched.value) {
      const viewed = new Set(readViewedPinned());
      pinnedCollapsed.value =
        pinned.value.length > 0 && pinned.value.every((p) => viewed.has(p.targetId));
    }
  } catch {
    if (!silent) error.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !nextCursor.value) return;
  loadingMore.value = true;
  loadMoreError.value = false;
  try {
    const feed = await getRecommendFeed(nextCursor.value.lastScore, nextCursor.value.lastId);
    items.value.push(...feed.items);
    nextCursor.value = feed.nextCursor;
  } catch {
    loadMoreError.value = true;
  } finally {
    loadingMore.value = false;
  }
}

function refresh(): void {
  pinnedTouched.value = false;
  void loadFeed();
}

function togglePinned(): void {
  pinnedTouched.value = true;
  pinnedCollapsed.value = !pinnedCollapsed.value;
}

function toFeedItem(p: PinnedItemInfo): RecommendItem | null {
  if (!p.data) return null;
  const data = { likeCount: 0, ...p.data } as Record<string, unknown>;
  return {
    type: p.targetType,
    id: p.targetId,
    score: 0,
    data,
  } as unknown as RecommendItem;
}

function onPinnedClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest("[data-pinned-id]");
  const id = target?.getAttribute("data-pinned-id");
  if (id) markPinnedViewed(id);
}

function setupObserver(): void {
  if (!sentinelEl.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    },
    { rootMargin: "200px 0px" }
  );
  observer.observe(sentinelEl.value);
}

onMounted(() => {
  const snapshot = readFeedSnapshot(auth.userId ?? null);
  if (snapshot) {
    pinned.value = snapshot.pinned ?? [];
    items.value = snapshot.items;
    nextCursor.value = snapshot.nextCursor;
    loading.value = false;
    const firstPost = items.value.find((item) => item.type === "post");
    setTourFirstPostId(firstPost ? firstPost.id : null);
  }
  void loadFeed(Boolean(snapshot)).then(setupObserver);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

function goCreatePost(): void {
  void router.push({ name: "post-create" });
}
</script>

<template>
  <div class="pb-16 md:pb-4">
    <!-- 顶部轻量工具条 -->
    <div class="flex items-center justify-between border-b border-subtle px-4 py-2 sm:px-5">
      <span class="text-xs font-medium text-ink-muted">推荐动态</span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-hover hover:text-ink pressable disabled:opacity-50"
        :disabled="loading"
        @click="refresh"
      >
        <AppSvgIcon name="refresh" :size="13" />
        刷新
      </button>
    </div>

    <!-- 骨架屏 / 错误态 -->
    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <ErrorState v-else-if="error" @retry="loadFeed" />

    <template v-else>
      <!-- 置顶区（可折叠，保留 Collapse .disclosure 供 check-layout.mjs 验证） -->
      <section v-if="pinned.length > 0" data-tour="home-pinned">
        <button
          type="button"
          class="flex w-full items-center gap-2 border-b border-subtle bg-canvas-soft px-4 py-2.5 text-left text-xs font-semibold text-ink-secondary transition-colors hover:bg-hover sm:px-5"
          @click="togglePinned"
        >
          <AppSvgIcon name="pin" :size="13" class="shrink-0 text-accent-warm" />
          <span>置顶内容</span>
          <span class="rounded-full bg-accent-warm-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-accent-warm">
            {{ pinned.length }}
          </span>
          <AppSvgIcon
            :name="pinnedCollapsed ? 'chevronDown' : 'chevronUp'"
            :size="14"
            class="ml-auto text-ink-muted"
          />
        </button>
        <Collapse :open="!pinnedCollapsed">
          <div @click="onPinnedClick">
            <div v-for="p in pinned" :key="p.id" :data-pinned-id="p.targetId">
              <FeedItem v-if="toFeedItem(p)" :item="toFeedItem(p)!" />
            </div>
          </div>
        </Collapse>
      </section>

      <!-- 主信息流（Elk 无边框 1px 分割线） -->
      <section v-if="items.length > 0" data-tour="home-feed">
        <FeedItem v-for="item in items" :key="`${item.type}-${item.id}`" :item="item" />
      </section>

      <!-- 空状态 -->
      <EmptyState
        v-if="pinned.length === 0 && items.length === 0"
        text="还没有内容"
        description="广场空空如也，来发布第一篇帖子吧。"
      >
        <button type="button" class="btn-primary !py-2 text-xs" @click="goCreatePost">
          <AppSvgIcon name="penLine" :size="14" />
          发布帖子
        </button>
      </EmptyState>

      <!-- 底部哨兵 + 加载态 -->
      <div ref="sentinelEl" class="py-6 text-center">
        <div v-if="loadingMore" class="text-xs text-ink-muted">正在加载更多…</div>
        <div v-else-if="loadMoreError">
          <button type="button" class="text-xs text-primary hover:underline" @click="loadMore">
            加载失败，点击重试
          </button>
        </div>
        <div v-else-if="!nextCursor && items.length > 0" class="text-xs text-ink-muted">
          已经到底啦
        </div>
      </div>
    </template>

    <!-- 移动端悬浮发帖按钮（仅 <768px 展示，桌面/平板由左侧栏承担） -->
    <button
      type="button"
      data-tour="home-fab"
      class="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-fab pressable md:hidden"
      style="bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px))"
      aria-label="发帖"
      @click="goCreatePost"
    >
      <AppSvgIcon name="penLine" :size="20" />
    </button>
  </div>
</template>
