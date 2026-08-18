<!--
  搜索页

  功能：
    - 关键词搜索（/api/search?q=&type=&limit=&offset=）
    - 类型筛选 tab：全部 / 帖子 / 用户 / 板块 / 大事记 / 表白墙 / 评论
    - 分类展示结果；帖子 / 评论结果点击进入详情
    - 分页加载更多（offset 递增）
    - 用户卡片带关注按钮；板块卡片进入板块详情
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { search } from "../api/search";
import { followUser } from "../api/follow";
import { formatRelativeTime, truncateText } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { SearchType } from "../types";
import type {
  SearchPostResult,
  SearchUserResult,
  SearchBlockResult,
  SearchTimelineResult,
  SearchConfessionResult,
} from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 每页条数 */
const PAGE_SIZE = 20;

// ------------------------------------------------------------
//  状态
// ------------------------------------------------------------

const keyword = ref((route.query.q as string) ?? "");
const activeType = ref<SearchType>(((route.query.type as SearchType) ?? "all") as SearchType);

const loading = ref(false);
const error = ref(false);
/** 是否已执行过搜索（区分初始空态与无结果空态） */
const searched = ref(false);
const loadingMore = ref(false);

/** 各类结果 */
const posts = ref<SearchPostResult[]>([]);
const comments = ref<SearchPostResult[]>([]);
const users = ref<SearchUserResult[]>([]);
const blocks = ref<SearchBlockResult[]>([]);
const timeline = ref<SearchTimelineResult[]>([]);
const confessions = ref<SearchConfessionResult[]>([]);

/** 当前搜索的偏移量（加载更多用） */
const offset = ref(0);
/** 是否还有更多（本页返回条数 == PAGE_SIZE 视为可能还有） */
const hasMore = ref(false);

/** 已关注的用户 ID（本地记录，无初始状态接口） */
const followedIds = ref<Set<string>>(new Set());

/** 类型 tab 配置 */
const TYPE_TABS: { value: SearchType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "post", label: "帖子" },
  { value: "user", label: "用户" },
  { value: "block", label: "板块" },
  { value: "timeline", label: "大事记" },
  { value: "confession", label: "表白墙" },
  { value: "comment", label: "评论" },
];

/** 是否有任何结果 */
const hasAnyResult = computed(
  () =>
    posts.value.length > 0 ||
    comments.value.length > 0 ||
    users.value.length > 0 ||
    blocks.value.length > 0 ||
    timeline.value.length > 0 ||
    confessions.value.length > 0
);

// ------------------------------------------------------------
//  搜索
// ------------------------------------------------------------

/** 执行搜索（append = true 时追加到现有结果） */
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
    // 按 id 去重追加
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

/** 去重追加辅助 */
function dedupeAppend<T>(
  existing: T[],
  incoming: T[],
  keyOf: (item: T) => string = (item) => (item as { id: string }).id
): T[] {
  if (incoming.length === 0) return existing;
  const keys = new Set(existing.map(keyOf));
  return [...existing, ...incoming.filter((item) => !keys.has(keyOf(item)))];
}

/** 提交搜索（输入框回车 / 按钮） */
function onSubmit(): void {
  void doSearch(false);
}

/** 切换类型 tab → 重新搜索 */
function selectType(type: SearchType): void {
  if (activeType.value === type) return;
  activeType.value = type;
  if (searched.value) void doSearch(false);
}

// ------------------------------------------------------------
//  结果交互
// ------------------------------------------------------------

/** 打开帖子详情 */
function openPost(post: SearchPostResult): void {
  router.push({ name: "post-detail", params: { id: post.id } });
}

/** 打开评论详情 */
function openComment(comment: SearchPostResult): void {
  router.push({ name: "comment-detail", params: { id: comment.id } });
}

/** 打开板块详情 */
function openBlock(block: SearchBlockResult): void {
  router.push({ name: "block-detail", params: { id: block.id } });
}

/** 关注用户（本地状态切换；初始状态需逐个查询，此处简化） */
async function onFollow(user: SearchUserResult): Promise<void> {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
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
</script>

<template>
  <div class="px-3 pb-10 pt-3">
    <!-- 搜索框 -->
    <form class="flex items-center gap-2" @submit.prevent="onSubmit">
      <div class="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 focus-within:border-primary">
        <AppSvgIcon name="search" :size="16" class="shrink-0 text-ink-soft" />
        <input
          v-model="keyword"
          type="search"
          class="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft/60"
          placeholder="搜索帖子 / 用户 / 板块…"
          enterkeyhint="search"
        />
        <button v-if="keyword" type="button" aria-label="清空" @click="keyword = ''">
          <AppSvgIcon name="close" :size="14" class="text-ink-soft" />
        </button>
      </div>
      <button type="submit" class="btn-primary !py-2 text-sm">搜索</button>
    </form>

    <!-- 类型筛选 tab -->
    <div class="scrollbar-none -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1">
      <button
        v-for="tab in TYPE_TABS"
        :key="tab.value"
        type="button"
        class="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        :class="
          activeType === tab.value
            ? 'bg-primary text-white'
            : 'bg-surface text-ink-soft'
        "
        @click="selectType(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 结果区 -->
    <div class="mt-3">
      <LoadingSpinner v-if="loading" />
      <ErrorState v-else-if="error" @retry="onSubmit" />

      <!-- 初始空态 -->
      <EmptyState v-else-if="!searched" text="输入关键词开始搜索" icon="search" />

      <!-- 无结果 -->
      <EmptyState v-else-if="!hasAnyResult" text="没有找到相关内容" icon="search" />

      <template v-else>
        <!-- 帖子 -->
        <section v-if="posts.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">帖子</h3>
          <div class="space-y-2">
            <article
              v-for="post in posts"
              :key="post.id"
              class="card-base cursor-pointer transition-opacity active:opacity-80"
              role="button"
              @click="openPost(post)"
            >
              <h4 v-if="post.title" class="mb-1 text-sm font-semibold">{{ post.title }}</h4>
              <p class="break-all text-sm text-ink">{{ truncateText(post.content, 100) }}</p>
              <div class="mt-2 text-[11px] text-ink-soft">{{ formatRelativeTime(post.createdAt) }}</div>
            </article>
          </div>
        </section>

        <!-- 用户 -->
        <section v-if="users.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">用户</h3>
          <div class="card-base divide-y divide-line !py-1">
            <div v-for="user in users" :key="user.userId" class="flex items-center gap-2 py-2.5">
              <!-- 头像（有头像显示图片，否则首字占位） -->
              <img
                v-if="user.avatar"
                :src="user.avatar"
                :alt="user.username"
                class="h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <span
                v-else
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-xs font-semibold"
                :style="{ color: user.nameColor ?? undefined }"
              >
                {{ user.username.slice(0, 1) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium" :style="{ color: user.nameColor ?? undefined }">
                    {{ user.username }}
                  </span>
                  <span
                    v-if="user.badge"
                    class="shrink-0 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1 text-[10px] text-primary"
                  >
                    {{ user.badge }}
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-opacity active:opacity-70"
                :class="followedIds.has(user.userId) ? 'bg-line text-ink-soft' : 'bg-primary text-white'"
                :disabled="followedIds.has(user.userId)"
                @click="onFollow(user)"
              >
                {{ followedIds.has(user.userId) ? "已关注" : "关注" }}
              </button>
            </div>
          </div>
        </section>

        <!-- 板块 -->
        <section v-if="blocks.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">板块</h3>
          <div class="space-y-2">
            <article
              v-for="block in blocks"
              :key="block.id"
              class="card-base cursor-pointer transition-opacity active:opacity-80"
              role="button"
              @click="openBlock(block)"
            >
              <div class="flex items-center gap-1.5">
                <AppSvgIcon name="blocks" :size="15" class="text-primary" />
                <h4 class="text-sm font-semibold">{{ block.name }}</h4>
                <span
                  v-if="block.isLocked"
                  class="rounded bg-line px-1 text-[10px] text-ink-soft"
                >
                  已锁定
                </span>
              </div>
              <p v-if="block.description" class="mt-1 break-all text-xs text-ink-soft">
                {{ truncateText(block.description, 80) }}
              </p>
            </article>
          </div>
        </section>

        <!-- 大事记 -->
        <section v-if="timeline.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">大事记</h3>
          <div class="space-y-2">
            <article
              v-for="event in timeline"
              :key="event.id"
              class="card-base cursor-pointer transition-opacity active:opacity-80"
              role="button"
              @click="router.push({ name: 'timeline' })"
            >
              <div class="flex items-center gap-1.5">
                <AppSvgIcon name="calendar" :size="15" class="text-primary" />
                <h4 class="text-sm font-semibold">{{ event.title }}</h4>
                <span class="ml-auto text-[11px] text-ink-soft">{{ event.eventDate.slice(0, 10) }}</span>
              </div>
              <p class="mt-1 break-all text-xs text-ink-soft">{{ truncateText(event.description, 80) }}</p>
            </article>
          </div>
        </section>

        <!-- 表白墙 -->
        <section v-if="confessions.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">表白墙</h3>
          <div class="space-y-2">
            <article
              v-for="confession in confessions"
              :key="confession.id"
              class="card-base cursor-pointer transition-opacity active:opacity-80"
              role="button"
              @click="router.push({ name: 'confession' })"
            >
              <div class="mb-1 flex items-center gap-1.5 text-xs text-accent">
                <AppSvgIcon name="heart" :size="13" />
                表白墙
                <span class="ml-auto text-ink-soft">{{ formatRelativeTime(confession.createdAt) }}</span>
              </div>
              <p class="break-all text-sm text-ink">{{ truncateText(confession.content, 100) }}</p>
            </article>
          </div>
        </section>

        <!-- 评论 -->
        <section v-if="comments.length > 0" class="mb-4">
          <h3 class="mb-2 px-1 text-sm font-semibold text-ink-soft">评论</h3>
          <div class="space-y-2">
            <article
              v-for="comment in comments"
              :key="comment.id"
              class="card-base cursor-pointer transition-opacity active:opacity-80"
              role="button"
              @click="openComment(comment)"
            >
              <div class="mb-1 flex items-center gap-1.5 text-xs text-ink-soft">
                <AppSvgIcon name="comment" :size="13" />
                评论
                <span class="ml-auto">{{ formatRelativeTime(comment.createdAt) }}</span>
              </div>
              <p class="break-all text-sm text-ink">{{ truncateText(comment.content, 100) }}</p>
            </article>
          </div>
        </section>

        <!-- 加载更多 -->
        <div class="py-3 text-center">
          <button
            v-if="hasMore"
            type="button"
            class="btn-secondary !py-2 text-sm"
            :disabled="loadingMore"
            @click="doSearch(true)"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
          <span v-else class="text-xs text-ink-soft">没有更多结果了</span>
        </div>
      </template>
    </div>
  </div>
</template>
