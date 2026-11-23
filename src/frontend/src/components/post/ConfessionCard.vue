<!--
  表白墙卡片（双模式：elk 首页分割流行 / memos 树洞轻白卡）

  - elk 变体：用于 HomeView 混合推荐流，采用 .feed-row-interactive（1px 分割线）
  - memos 变体：用于 ConfessionView 树洞流，采用 .memo-card-interactive（纯白轻卡片）
  - 匿名标签与时间克制置于顶部，心动点赞按钮使用 --accent-warm 左下对齐
-->
<script setup lang="ts">
import { shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime, formatNumber } from "../../utils/format";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { useAuthStore } from "../../stores/auth";

const props = withDefaults(
  defineProps<{
    id: string;
    content: string;
    likeCount: number;
    createdAt: string;
    variant?: "elk" | "memos";
  }>(),
  { variant: "elk" }
);

const router = useRouter();
const auth = useAuthStore();

const liked = shallowRef(false);
const likeCount = shallowRef(props.likeCount);
const likeBusy = shallowRef(false);

async function onToggleLike(event: Event): Promise<void> {
  event.stopPropagation();
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("confession", props.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    showToast("点赞失败，请稍后重试", "error");
  } finally {
    likeBusy.value = false;
  }
}

function openConfession(): void {
  void router.push({ name: "confession-detail", params: { id: props.id } });
}
</script>

<template>
  <article
    :class="variant === 'memos' ? 'memo-card-interactive' : 'feed-row-interactive'"
    role="button"
    tabindex="0"
    @click="openConfession"
    @keydown.enter="openConfession"
  >
    <!-- 顶部：克制的匿名标识与相对时间 -->
    <div class="flex items-center gap-2">
      <span
        v-if="variant === 'memos'"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-accent-warm" />
        匿名树洞
      </span>
      <span v-else class="tag-pill-warm">
        <AppSvgIcon name="heart" :size="12" />
        表白墙
      </span>

      <time
        class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
        :datetime="createdAt"
      >
        {{ formatRelativeTime(createdAt) }}
      </time>
    </div>

    <!-- 正文：Memos 模式突出柔和阅读节奏 -->
    <p
      class="whitespace-pre-line break-words text-ink"
      :class="
        variant === 'memos'
          ? 'mt-2.5 text-[15px] leading-[1.7]'
          : 'mt-2 line-clamp-4 text-sm leading-6'
      "
    >
      {{ content }}
    </p>

    <!-- 底部操作栏：心动按钮左下对齐 -->
    <div class="mt-3 flex items-center gap-4 text-xs tabular-nums text-ink-muted">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 pressable"
        :class="
          liked
            ? 'bg-accent-warm-soft font-medium text-accent-warm'
            : '-ml-2 hover:bg-accent-warm-soft hover:text-accent-warm'
        "
        :disabled="likeBusy"
        aria-label="心动点赞"
        @click="onToggleLike"
      >
        <AppSvgIcon name="heart" :size="15" />
        <span>{{ formatNumber(likeCount) }}</span>
      </button>

      <span
        v-if="variant === 'memos'"
        class="ml-auto inline-flex items-center gap-0.5 text-xs text-ink-muted"
      >
        详情
        <AppSvgIcon name="chevronRight" :size="13" />
      </span>
    </div>
  </article>
</template>
