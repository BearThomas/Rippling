<!--
  表白墙页 — 匿名表白列表

  - 数据源：GET /api/confession/list（preview 为 100 字截断预览）
  - 每条显示内容预览 / 点赞数 / 时间，点击进详情
  - 右下角「发布表白」→ 页面内底部弹出层（永远匿名）
  - 分页加载更多
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import { getConfessionList, createConfession } from "../api/confession";
import { formatRelativeTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { ConfessionListItem } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 每页条数 */
const PAGE_SIZE = 20;

const loading = ref(true);
const error = ref(false);
const confessions = ref<ConfessionListItem[]>([]);

/** 分页状态 */
const loadingMore = ref(false);
const hasMore = ref(true);

/** 发布弹层状态 */
const showComposer = ref(false);
const draft = ref("");
const submitting = ref(false);

/** 首次加载 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    confessions.value = await getConfessionList(PAGE_SIZE, 0);
    hasMore.value = confessions.value.length >= PAGE_SIZE;
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
    const more = await getConfessionList(PAGE_SIZE, confessions.value.length);
    confessions.value = [...confessions.value, ...more];
    hasMore.value = more.length >= PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

/** 进详情 */
function openDetail(item: ConfessionListItem): void {
  router.push({ name: "confession-detail", params: { id: item.id } });
}

/** 打开发布弹层（未登录先引导登录） */
function openComposer(): void {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  showComposer.value = true;
}

/** 关闭弹层 */
function closeComposer(): void {
  if (submitting.value) return;
  showComposer.value = false;
}

/** 发布表白（永远匿名，后端不记录展示作者） */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  const content = draft.value.trim();
  if (!content) {
    showToast("内容不能为空", "error");
    return;
  }
  submitting.value = true;
  try {
    const { id } = await createConfession(content);
    // 本地构造列表项插入顶部（与后端列表结构一致）
    confessions.value = [
      {
        id,
        preview: content.length > 100 ? content.slice(0, 100) + "..." : content,
        createdAt: new Date().toISOString(),
        likeCount: 0,
      },
      ...confessions.value,
    ];
    draft.value = "";
    showComposer.value = false;
    showToast("发布成功", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="px-3 pb-20 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <div v-if="confessions.length > 0" class="space-y-3">
        <article
          v-for="item in confessions"
          :key="item.id"
          class="card-base cursor-pointer transition-opacity active:opacity-80"
          role="button"
          tabindex="0"
          @click="openDetail(item)"
          @keydown.enter="openDetail(item)"
        >
          <!-- 内容预览（匿名，不显示作者） -->
          <p class="whitespace-pre-line break-all text-sm leading-relaxed">{{ item.preview }}</p>
          <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
            <span class="flex items-center gap-1 text-accent">
              <AppSvgIcon name="heart" :size="14" />
              {{ formatNumber(item.likeCount) }}
            </span>
            <span class="ml-auto">{{ formatRelativeTime(item.createdAt) }}</span>
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

      <EmptyState v-else text="还没有表白，来抢沙发" icon="heart" />
    </template>

    <!-- 右下角发布按钮（FAB） -->
    <button
      type="button"
      class="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-opacity active:opacity-80"
      aria-label="发布表白"
      @click="openComposer"
    >
      <AppSvgIcon name="edit" :size="20" />
    </button>

    <!-- 发布弹层（底部弹出） -->
    <div
      v-if="showComposer"
      class="fixed inset-0 z-50 flex items-end bg-black/40"
      @click.self="closeComposer"
    >
      <div class="w-full rounded-t-2xl bg-surface px-4 pb-6 pt-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold">发布表白</h3>
          <button type="button" aria-label="关闭" @click="closeComposer">
            <AppSvgIcon name="close" :size="18" class="text-ink-soft" />
          </button>
        </div>
        <p class="mb-2 text-xs text-ink-soft">完全匿名发布，不会显示你的身份。</p>
        <textarea
          v-model="draft"
          class="input-base min-h-28 resize-y"
          placeholder="匿名说出你想说的话…"
          maxlength="1000"
        />
        <div class="mt-2 flex items-center justify-between">
          <span class="text-[10px] text-ink-soft">{{ draft.length }}/1000</span>
          <button
            type="button"
            class="btn-primary !py-1.5 text-sm disabled:opacity-50"
            :disabled="!draft.trim() || submitting"
            @click="handleSubmit"
          >
            {{ submitting ? "发布中…" : "发布" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
