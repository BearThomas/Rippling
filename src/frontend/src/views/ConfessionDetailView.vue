<!--
  表白详情页（/confession/:id · Memos 轻白卡详情）

  - 运行在 --bg-canvas-soft 画布上，纯白轻卡片呈现完整正文
  - 匿名标识与时间克制置顶，心动按钮使用 --accent-warm 左下对齐
  - 支持一键复制链接与举报跳转
-->
<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { getConfessionDetail } from "../api/confession";
import { toggleLike } from "../api/like";
import { formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { ConfessionInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const confessionId = route.params.id as string;

const loading = shallowRef(true);
const error = shallowRef(false);
const confession = ref<ConfessionInfo | null>(null);

const liked = shallowRef(false);
const likeCount = shallowRef(0);
const likeBusy = shallowRef(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getConfessionDetail(confessionId);
    confession.value = data;
    likeCount.value = data.likeCount ?? 0;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

function requireLogin(): boolean {
  if (auth.isLoggedIn) return true;
  void router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

async function onToggleLike(): Promise<void> {
  if (!requireLogin() || likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("confession", confessionId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

async function copyShareLink(): Promise<void> {
  const url = `${window.location.origin}/confession/${confessionId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("链接已复制", "success");
  } catch {
    showToast("复制失败，请手动复制地址栏链接", "error");
  }
}

function goReport(): void {
  if (!requireLogin()) return;
  void router.push({
    path: "/ticket/create",
    query: { type: "report", targetType: "confession", targetId: confessionId },
  });
}

onMounted(load);
</script>

<template>
  <div class="px-3.5 py-4 sm:px-5 sm:py-5">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="表白不存在或无权访问" @retry="load" />

    <article v-else-if="confession" class="memo-card !p-5 sm:!p-6">
      <!-- 顶部：克制的匿名标识 + 发布时间 -->
      <div class="flex items-center gap-2 text-xs text-ink-muted">
        <span class="tag-pill-warm">
          <AppSvgIcon name="heart" :size="12" />
          匿名表白
        </span>
        <time class="ml-auto tabular-nums" :datetime="confession.createdAt">
          {{ formatDateTime(confession.createdAt) }}
        </time>
      </div>

      <!-- 完整正文：柔和阅读节奏 -->
      <p class="mt-4 whitespace-pre-line break-words text-[15px] leading-[1.8] text-ink sm:text-base">
        {{ confession.content }}
      </p>

      <!-- 底部操作栏：心动按钮左下对齐 + 分享 + 举报 -->
      <div class="mt-6 flex items-center gap-3 border-t border-subtle pt-3.5 text-xs tabular-nums text-ink-muted">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 pressable"
          :class="
            liked
              ? 'bg-accent-warm-soft font-medium text-accent-warm'
              : 'bg-canvas-soft text-ink-secondary hover:bg-accent-warm-soft hover:text-accent-warm'
          "
          :disabled="likeBusy"
          @click="onToggleLike"
        >
          <AppSvgIcon name="heart" :size="15" />
          <span>{{ formatNumber(likeCount) }}</span>
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-hover hover:text-ink pressable"
          @click="copyShareLink"
        >
          <AppSvgIcon name="share" :size="14" />
          分享
        </button>

        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger pressable"
          @click="goReport"
        >
          <AppSvgIcon name="shield" :size="14" />
          举报
        </button>
      </div>
    </article>
  </div>
</template>
