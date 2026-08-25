<!--
  首页 — 推荐流

  功能：
    - /api/recommend 游标分页拉取（第一页含置顶）
    - 置顶区：可折叠；已查看过的置顶（localStorage 记录）下次自动折叠
    - 多类型卡片分发（帖子 / 表白墙 / 大事记 / 投票）
    - IntersectionObserver 无限滚动（防重复加载 + 失败重试）
    - 顶部刷新按钮；右下角悬浮发帖按钮
-->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import FeedItem from "../components/post/FeedItem.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getRecommendFeed } from "../api/recommend";
import type { PinnedItemInfo, RecommendItem } from "../types";

const router = useRouter();

/** 已查看置顶 ID 的 localStorage 键 */
const VIEWED_PINNED_KEY = "rippling.viewedPinned";

// ------------------------------------------------------------
//  状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);

/** 置顶内容（仅第一页返回） */
const pinned = ref<PinnedItemInfo[]>([]);
/** 推荐流内容 */
const items = ref<RecommendItem[]>([]);
/** 下一页游标（null = 没有更多） */
const nextCursor = ref<{ lastScore: number; lastId: string } | null>(null);

/** 无限滚动状态 */
const loadingMore = ref(false);
const loadMoreError = ref(false);

/** 置顶区折叠状态 */
const pinnedCollapsed = ref(false);
/** 本次会话手动展开过（展开后不再因 viewed 记录自动折叠） */
const pinnedTouched = ref(false);

/** 底部哨兵元素（IntersectionObserver 监听目标） */
const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

// ------------------------------------------------------------
//  置顶已查看记录（localStorage）
// ------------------------------------------------------------

/** 读取已查看的置顶 ID 列表 */
function readViewedPinned(): string[] {
  try {
    const raw = localStorage.getItem(VIEWED_PINNED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** 记录置顶为已查看 */
function markPinnedViewed(targetId: string): void {
  const viewed = new Set(readViewedPinned());
  if (viewed.has(targetId)) return;
  viewed.add(targetId);
  try {
    // 只保留最近 100 条，避免无限增长
    const list = [...viewed].slice(-100);
    localStorage.setItem(VIEWED_PINNED_KEY, JSON.stringify(list));
  } catch {
    // 存储不可用时忽略
  }
}

// ------------------------------------------------------------
//  数据加载
// ------------------------------------------------------------

/** 拉取第一页（含置顶） */
async function loadFeed(): Promise<void> {
  loading.value = true;
  error.value = false;
  loadMoreError.value = false;
  try {
    const feed = await getRecommendFeed();
    pinned.value = feed.pinned ?? [];
    items.value = feed.items ?? [];
    nextCursor.value = feed.nextCursor;
    // 置顶全部已查看过 → 默认折叠
    if (!pinnedTouched.value) {
      const viewed = new Set(readViewedPinned());
      pinnedCollapsed.value =
        pinned.value.length > 0 && pinned.value.every((p) => viewed.has(p.targetId));
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 加载下一页（游标分页，防止重复触发） */
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

/** 刷新（重新加载第一页） */
function refresh(): void {
  pinnedTouched.value = false;
  void loadFeed();
}

// ------------------------------------------------------------
//  置顶交互
// ------------------------------------------------------------

/** 切换置顶区折叠 */
function togglePinned(): void {
  pinnedTouched.value = true;
  pinnedCollapsed.value = !pinnedCollapsed.value;
}

/** 置顶内容转推荐流卡片数据（data 结构一致，补齐缺失的 likeCount） */
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

/**
 * 置顶区点击委托：捕获卡片点击并记录为已查看
 * （卡片内部自行跳转，这里只做记录）
 */
function onPinnedClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest("[data-pinned-id]");
  const id = target?.getAttribute("data-pinned-id");
  if (id) markPinnedViewed(id);
}

// ------------------------------------------------------------
//  无限滚动
// ------------------------------------------------------------

function setupObserver(): void {
  if (!sentinelEl.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      // 哨兵进入视口 → 尝试加载下一页
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    },
    { rootMargin: "200px 0px" }
  );
  observer.observe(sentinelEl.value);
}

onMounted(() => {
  void loadFeed().then(setupObserver);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

/** 跳转发帖页 */
function goCreatePost(): void {
  router.push({ name: "post-create" });
}
</script>

<template>
  <div class="px-3 pb-24 pt-3">
    <!-- 顶部工具行：刷新 -->
    <div class="mb-2 flex items-center justify-end">
      <button
        type="button"
        class="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-soft transition-colors active:text-primary"
        :disabled="loading"
        @click="refresh"
      >
        <AppSvgIcon name="refresh" :size="14" />
        刷新
      </button>
    </div>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="loadFeed" />

    <template v-else>
      <!-- 置顶区（可折叠） -->
      <section v-if="pinned.length > 0" class="mb-3">
        <button
          type="button"
          class="mb-2 flex w-full items-center gap-1 px-1 text-sm font-semibold text-accent"
          @click="togglePinned"
        >
          <AppSvgIcon name="pin" :size="14" />
          置顶内容（{{ pinned.length }}）
          <AppSvgIcon
            :name="pinnedCollapsed ? 'chevronDown' : 'chevronUp'"
            :size="14"
            class="ml-auto"
          />
        </button>
        <div v-if="!pinnedCollapsed" class="space-y-3" @click="onPinnedClick">
          <div v-for="p in pinned" :key="p.id" :data-pinned-id="p.targetId">
            <FeedItem v-if="toFeedItem(p)" :item="toFeedItem(p)!" />
          </div>
        </div>
      </section>

      <!-- 推荐流 -->
      <section v-if="items.length > 0" class="space-y-3">
        <FeedItem v-for="item in items" :key="`${item.type}-${item.id}`" :item="item" />
      </section>

      <!-- 空状态 -->
      <EmptyState
        v-if="pinned.length === 0 && items.length === 0"
        text="还没有内容，来发布第一篇帖子吧"
      />

      <!-- 底部哨兵 + 加载状态 -->
      <div ref="sentinelEl" class="py-4">
        <div v-if="loadingMore" class="text-center text-xs text-ink-soft">加载中…</div>
        <div v-else-if="loadMoreError" class="text-center">
          <button type="button" class="text-xs text-primary underline" @click="loadMore">
            加载失败，点击重试
          </button>
        </div>
        <div v-else-if="!nextCursor && items.length > 0" class="text-center text-xs text-ink-soft">
          已经到底啦
        </div>
      </div>
    </template>

    <!-- 悬浮发帖按钮 -->
    <button
      type="button"
      class="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform active:scale-95"
      aria-label="发帖"
      @click="goCreatePost"
    >
      <AppSvgIcon name="plusSquare" :size="22" />
    </button>
  </div>
</template>
