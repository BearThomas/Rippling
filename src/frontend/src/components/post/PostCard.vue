<!--
  帖子卡片（列表项）

  展示：作者（匿名时隐藏）、时间、标题、内容预览、点赞/评论数。
  点击整卡跳转详情页。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime, formatNumber, truncateText } from "../../utils/format";
import type { PostInfo } from "../../types";

const props = defineProps<{ post: PostInfo }>();

const router = useRouter();

/** 作者显示名：匿名（authorVisible=false）或无作者信息时显示「匿名用户」 */
const authorName = computed(() => {
  if (!props.post.authorVisible) return "匿名用户";
  return props.post.author?.username ?? "未知用户";
});

/** 内容预览（纯文本截断） */
const preview = computed(() => truncateText(props.post.content, 120));

function openDetail(): void {
  router.push({ name: "post-detail", params: { id: props.post.id } });
}
</script>

<template>
  <article
    class="card-base cursor-pointer transition-opacity active:opacity-80"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <!-- 作者行 -->
    <div class="mb-2 flex items-center gap-2">
      <span
        class="text-sm font-medium"
        :style="{ color: post.author?.nameColor ?? undefined }"
      >
        {{ authorName }}
      </span>
      <span
        v-if="post.author?.badge"
        class="rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1 text-[10px] text-primary"
      >
        {{ post.author.badge }}
      </span>
      <span
        v-if="post.isPinned"
        class="rounded bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] px-1 text-[10px] text-accent"
      >
        置顶
      </span>
      <span class="ml-auto shrink-0 text-xs text-ink-soft">
        {{ formatRelativeTime(post.createdAt) }}
      </span>
    </div>

    <!-- 标题 -->
    <h3 v-if="post.title" class="mb-1 text-base font-semibold">
      {{ post.title }}
    </h3>

    <!-- 内容预览 -->
    <p class="whitespace-pre-line break-all text-sm leading-relaxed text-ink">
      {{ preview }}
    </p>

    <!-- 统计行 -->
    <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
      <span class="flex items-center gap-1">
        <AppSvgIcon name="thumbUp" :size="14" />
        {{ formatNumber(post.likeCount ?? 0) }}
      </span>
      <span class="flex items-center gap-1">
        <AppSvgIcon name="comment" :size="14" />
        {{ formatNumber(post.commentCount ?? 0) }}
      </span>
    </div>
  </article>
</template>
