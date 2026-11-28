<!--
  搜索页（Elk 无边框信息流 + reka-ui AppTabs 分类筛选）

  - 支持通过路由 query ?q=&type= 自动触发搜索（衔接桌面端右栏搜索框）
  - 保留 data-tour="search-tabs"
  - 所有用户头像统一使用 UserAvatar 并透传 :name-color
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import PostImageStrip from "../components/post/PostImageStrip.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import { search } from "../api/search";
import { extractImageUrls, stripImages } from "../utils/markdownImages";
import { followUser } from "../api/follow";
import { formatRelativeTime, truncateText } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type {
  SearchType,
  SearchPostResult,
  SearchUserResult,
  SearchBlockResult,
  SearchTimelineResult,
  SearchConfessionResult,
} from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const PAGE_SIZE = 20;

const keyword = shallowRef((route.query.q as string) ?? "");
const activeType = shallowRef<SearchType>(
  ((route.query.type as SearchType) ?? "all") as SearchType
);

const loading = shallowRef(false);
const error = shallowRef(false);
const searched = shallowRef(false);
const loadingMore = shallowRef(false);

const posts = ref<SearchPostResult[]>([]);
const comments = ref<SearchPostResult[]>([]);
const users = ref<SearchUserResult[]>([]);
const blocks = ref<SearchBlockResult[]>([]);
const timeline = ref<SearchTimelineResult[]>([]);
const confessions = ref<SearchConfessionResult[]>([]);

const offset = shallowRef(0);
const hasMore = shallowRef(false);
const followedIds = ref<Set<string>>(new Set());

const TYPE_TABS: readonly TabOption[] = [
  { value: "all", label: "全部" },
  { value: "post", label: "帖子" },
  { value: "user", label: "用户" },
  { value: "block", label: "板块" },
  { value: "timeline", label: "大事记" },
  { value: "confession", label: "表白墙" },
  { value: "comment", label: "评论" },
];

const hasAnyResult = computed(
  () =>
    posts.value.length > 0 ||
    comments.value.length > 0 ||
    users.value.length > 0 ||
    blocks.value.length > 0 ||
    timeline.value.length > 0 ||
    confessions.value.length > 0
);

function dedupeAppend<T>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string = (item) => (item as { id: string }).id
): T[] {
  if (incoming.length === 0) return existing;
  const keys = new Set(existing.map(keyOf));
  return [...existing, ...incoming.filter((item) => !keys.has(keyOf(item)))];
}

async function doSearch(append = false): Promise<void> {
  const q = keyword.value.trim();
  if (!q) {
    showToast("请输入搜索关键词", "error");
    return;
  }

  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
    error.value = false;
    offset.value = 0;
    posts.value = [];
    comments.value = [];
    users.value = [];
    blocks.value = [];
    timeline.value = [];
    confessions.value = [];
  }

  try {
    const data = await search(q, activeType.value, PAGE_SIZE, offset.value);
    const r = data.results;
    posts.value = dedupeAppend(posts.value, r.posts ?? []);
    comments.value = dedupeAppend(comments.value, r.comments ?? []);
    users.value = dedupeAppend(users.value, r.users ?? [], (u) => u.userId);
    blocks.value = dedupeAppend(blocks.value, r.blocks ?? []);
    timeline.value = dedupeAppend(timeline.value, r.timeline ?? []);
    confessions.value = dedupeAppend(confessions.value, r.confessions ?? []);

    const returnedCount = Object.values(r).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0
    );
    offset.value += PAGE_SIZE;
    hasMore.value = returnedCount >= PAGE_SIZE;
    searched.value = true;
  } catch {
    if (!append) error.value = true;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function onSubmit(): void {
  void doSearch(false);
}

function selectType(type: string): void {
  const next = type as SearchType;
  if (activeType.value === next) return;
  activeType.value = next;
  if (searched.value || keyword.value.trim()) void doSearch(false);
}

function previewText(content: string): string {
  return truncateText(stripImages(content), 140);
}

function openPost(post: SearchPostResult): void {
  void router.push({ name: "post-detail", params: { id: post.id } });
}

function openComment(comment: SearchPostResult): void {
  void router.push({ name: "comment-detail", params: { id: comment.id } });
}

function openBlock(block: SearchBlockResult): void {
  void router.push({ name: "block-detail", params: { id: block.id } });
}

function openUser(user: SearchUserResult): void {
  void router.push({ name: "user-profile", params: { id: user.userId } });
}

async function onFollow(user: SearchUserResult): Promise<void> {
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  if (followedIds.value.has(user.userId)) return;
  try {
    await followUser(user.userId);
    followedIds.value.add(user.userId);
    showToast("关注成功", "success");
  } catch {
    // client.ts 已自动 Toast
  }
}

onMounted(() => {
  if (keyword.value.trim()) {
    void doSearch(false);
  }
});

watch(
  () => [route.query.q, route.query.type] as const,
  ([nextQ, nextType]) => {
    const qStr = typeof nextQ === "string" ? nextQ : "";
    const tStr = (typeof nextType === "string" ? nextType : "all") as SearchType;
    let changed = false;
    if (qStr && qStr !== keyword.value) {
      keyword.value = qStr;
      changed = true;
    }
    if (tStr !== activeType.value) {
      activeType.value = tStr;
      changed = true;
    }
    if (changed && keyword.value.trim()) {
      void doSearch(false);
    }
  }
);
</script>

<template>
  <div class="overflow-x-hidden pb-6">
    <!-- 搜索框与类型筛选 -->
    <div class="border-b border-subtle px-4 pb-3 pt-3.5 sm:px-5">
      <form class="flex items-center gap-2" @submit.prevent="onSubmit">
        <div
          class="flex flex-1 items-center gap-2 rounded-full border border-strong bg-surface px-3.5 py-2 transition-colors focus-within:border-primary"
        >
          <AppSvgIcon name="search" :size="16" class="shrink-0 text-ink-muted" />
          <input
            v-model="keyword"
            type="search"
            class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            placeholder="搜索帖子、用户、板块…"
            enterkeyhint="search"
          />
          <button
            v-if="keyword"
            type="button"
            class="shrink-0 text-ink-muted hover:text-ink"
            aria-label="清空"
            @click="keyword = ''"
          >
            <AppSvgIcon name="close" :size="14" />
          </button>
        </div>
        <button type="submit" class="btn-primary shrink-0 !rounded-full !px-4 !py-2 text-sm">
          搜索
        </button>
      </form>

      <!-- 分类筛选（reka-ui AppTabs，保留 data-tour="search-tabs"） -->
      <div data-tour="search-tabs" class="mt-3">
        <AppTabs
          :model-value="activeType"
          :items="TYPE_TABS"
          variant="pills"
          aria-label="搜索结果分类"
          @update:model-value="selectType"
        />
      </div>
    </div>

    <!-- 结果区 -->
    <FeedSkeleton v-if="loading" variant="elk" :count="4" />
    <ErrorState v-else-if="error" @retry="onSubmit" />

    <EmptyState
      v-else-if="!searched"
      text="输入关键词开始搜索"
      description="支持搜索帖子、评论、用户、板块、大事记与表白墙。"
      icon="search"
    />

    <EmptyState
      v-else-if="!hasAnyResult"
      text="没有找到相关内容"
      description="换个关键词或切换分类再试试。"
      icon="search"
    />

    <template v-else>
      <!-- 帖子 -->
      <section v-if="posts.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          帖子
        </h3>
        <article
          v-for="post in posts"
          :key="post.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="openPost(post)"
          @keydown.enter="openPost(post)"
        >
          <h4 v-if="post.title" class="mb-1 line-clamp-2 text-[15px] font-semibold leading-[22px] text-ink">
            {{ post.title }}
          </h4>
          <p v-if="previewText(post.content)" class="line-clamp-3 break-words text-sm leading-6 text-ink-secondary">
            {{ previewText(post.content) }}
          </p>
          <PostImageStrip :urls="extractImageUrls(post.content)" @open="openPost(post)" />
          <time class="mt-2 block text-xs tabular-nums text-ink-muted" :datetime="post.createdAt">
            {{ formatRelativeTime(post.createdAt) }}
          </time>
        </article>
      </section>

      <!-- 用户 -->
      <section v-if="users.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          用户
        </h3>
        <div
          v-for="user in users"
          :key="user.userId"
          class="feed-row-interactive flex items-center gap-3"
          role="button"
          tabindex="0"
          @click="openUser(user)"
          @keydown.enter="openUser(user)"
        >
          <UserAvatar
            :src="user.avatar"
            :name="user.username"
            :name-color="user.nameColor"
            size="md"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                class="truncate text-sm font-semibold text-ink"
                :style="{ color: user.nameColor ?? undefined }"
              >
                {{ user.username }}
              </span>
              <span v-if="user.badge" class="tag-pill-accent !px-2 !py-0 text-[11px]">
                {{ user.badge }}
              </span>
            </div>
          </div>
          <button
            v-if="user.userId !== auth.userId"
            type="button"
            class="shrink-0 rounded-full px-3.5 py-1 text-xs font-medium pressable"
            :class="
              followedIds.has(user.userId)
                ? 'border border-subtle bg-canvas-soft text-ink-muted'
                : 'bg-primary text-white hover:opacity-90'
            "
            :disabled="followedIds.has(user.userId)"
            @click.stop="onFollow(user)"
          >
            {{ followedIds.has(user.userId) ? "已关注" : "关注" }}
          </button>
        </div>
      </section>

      <!-- 板块 -->
      <section v-if="blocks.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          板块
        </h3>
        <article
          v-for="block in blocks"
          :key="block.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="openBlock(block)"
          @keydown.enter="openBlock(block)"
        >
          <div class="flex items-center gap-2">
            <AppSvgIcon name="blocks" :size="15" class="shrink-0 text-primary" />
            <h4 class="truncate text-[15px] font-semibold text-ink">{{ block.name }}</h4>
            <span v-if="block.isLocked" class="tag-pill !px-2 !py-0 text-[11px]">
              已锁定
            </span>
          </div>
          <p v-if="block.description" class="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-ink-secondary">
            {{ truncateText(block.description, 100) }}
          </p>
        </article>
      </section>

      <!-- 大事记 -->
      <section v-if="timeline.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          大事记
        </h3>
        <article
          v-for="event in timeline"
          :key="event.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="router.push({ name: 'timeline-detail', params: { id: event.id } })"
          @keydown.enter="router.push({ name: 'timeline-detail', params: { id: event.id } })"
        >
          <div class="flex items-center gap-2">
            <AppSvgIcon name="calendar" :size="15" class="shrink-0 text-primary" />
            <h4 class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {{ event.title }}
            </h4>
            <span class="shrink-0 text-xs tabular-nums text-ink-muted">
              {{ event.eventDate.slice(0, 10) }}
            </span>
          </div>
          <p class="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-ink-secondary">
            {{ truncateText(event.description, 100) }}
          </p>
        </article>
      </section>

      <!-- 表白墙 -->
      <section v-if="confessions.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          表白墙
        </h3>
        <article
          v-for="confession in confessions"
          :key="confession.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="router.push({ name: 'confession-detail', params: { id: confession.id } })"
          @keydown.enter="router.push({ name: 'confession-detail', params: { id: confession.id } })"
        >
          <div class="flex items-center gap-2 text-xs">
            <span class="tag-pill-warm !px-2 !py-0 text-[11px]">
              <AppSvgIcon name="heart" :size="11" />
              表白墙
            </span>
            <time class="ml-auto tabular-nums text-ink-muted" :datetime="confession.createdAt">
              {{ formatRelativeTime(confession.createdAt) }}
            </time>
          </div>
          <p class="mt-1.5 line-clamp-3 break-words text-sm leading-6 text-ink">
            {{ truncateText(confession.content, 120) }}
          </p>
        </article>
      </section>

      <!-- 评论 -->
      <section v-if="comments.length > 0">
        <h3 class="border-b border-subtle bg-canvas-soft px-4 py-1.5 text-xs font-semibold text-ink-secondary sm:px-5">
          评论
        </h3>
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="feed-row-interactive"
          role="button"
          tabindex="0"
          @click="openComment(comment)"
          @keydown.enter="openComment(comment)"
        >
          <div class="flex items-center gap-2 text-xs text-ink-muted">
            <span class="inline-flex items-center gap-1 font-medium text-ink-secondary">
              <AppSvgIcon name="comment" :size="13" />
              评论
            </span>
            <time class="ml-auto tabular-nums" :datetime="comment.createdAt">
              {{ formatRelativeTime(comment.createdAt) }}
            </time>
          </div>
          <p class="mt-1.5 line-clamp-3 break-words text-sm leading-6 text-ink">
            {{ truncateText(comment.content, 120) }}
          </p>
        </article>
      </section>

      <!-- 加载更多 -->
      <div class="py-5 text-center">
        <button
          v-if="hasMore"
          type="button"
          class="btn-secondary !py-2 text-xs"
          :disabled="loadingMore"
          @click="doSearch(true)"
        >
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
        <span v-else class="text-xs text-ink-muted">没有更多结果了</span>
      </div>
    </template>
  </div>
</template>
