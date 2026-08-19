<!--
  帖子卡片（列表项）

  展示：作者头像占位（首字圆形）、用户名 + 颜色、徽章、置顶标记、
  相对时间、标题、内容预览（Markdown 转纯文本截断）、点赞 / 评论数。
  点击整卡跳转详情页。

  兼容两种数据源：PostInfo（详情 / 搜索）与推荐流的 post data。
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import { formatRelativeTime, formatNumber, truncateText } from "../../utils/format";
import type { PostAuthor } from "../../types";

/** 卡片所需的帖子数据结构（PostInfo / RecommendPostData 均兼容） */
interface PostCardData {
  id: string;
  title: string | null;
  content: string;
  /** 匿名时为 null */
  author?: PostAuthor | null;
  createdAt: string;
  likeCount?: number;
  commentCount?: number;
  isPinned?: boolean;
  liked?: boolean;
}

const props = defineProps<{ post: PostCardData }>();

const router = useRouter();

/** 匿名（无作者信息）标识 */
const isAnonymous = computed(() => !props.post.author);

/** 作者显示名 */
const authorName = computed(() => props.post.author?.username ?? "匿名用户");

/** 头像占位：作者名首字 */
const avatarChar = computed(() => authorName.value.slice(0, 1));

/** 作者主页路由（作者存在且有 id 时返回；匿名为 null → 不可点击） */
const authorProfileLink = computed(() => {
  const author = props.post.author;
  return author?.id
    ? { name: "user-profile" as const, params: { id: author.id } }
    : null;
});

/** 内容预览（Markdown 转纯文本后截断） */
const preview = computed(() => {
  const plain = props.post.content
    // 去掉代码块围栏与行内代码反引号
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    // 去掉图片 / 保留链接文字
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 去掉 Markdown 标记符号
    .replace(/[#>*_~|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateText(plain, 120);
});

/** 跳转帖子详情 */
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
      <!-- 有作者 → 头像 + 用户名包成链接，点击跳转用户主页（.stop 阻止触发整卡跳转） -->
      <RouterLink
        v-if="authorProfileLink"
        :to="authorProfileLink"
        class="flex min-w-0 items-center gap-2"
        @click.stop
      >
        <img
          v-if="post.author?.avatar"
          :src="post.author.avatar"
          :alt="authorName"
          class="h-7 w-7 shrink-0 rounded-full object-cover"
        />
        <span
          v-else
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          :style="
            post.author?.nameColor
              ? {
                  color: post.author.nameColor,
                  background: 'color-mix(in srgb, ' + post.author.nameColor + ' 14%, transparent)',
                }
              : undefined
          "
          :class="isAnonymous ? 'bg-line text-ink-soft' : 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] text-primary'"
        >
          {{ avatarChar }}
        </span>
        <span
          class="truncate text-sm font-medium"
          :style="{ color: post.author?.nameColor ?? undefined }"
        >
          {{ authorName }}
        </span>
      </RouterLink>

      <!-- 匿名：头像 + 用户名不可点击 -->
      <template v-else>
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line text-xs font-semibold text-ink-soft"
        >
          {{ avatarChar }}
        </span>
        <span class="truncate text-sm font-medium">{{ authorName }}</span>
      </template>
      <span
        v-if="post.author?.badge"
        class="shrink-0 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1 text-[10px] text-primary"
      >
        {{ post.author.badge }}
      </span>
      <span
        v-if="post.isPinned"
        class="flex shrink-0 items-center gap-0.5 rounded bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] px-1 text-[10px] text-accent"
      >
        <AppSvgIcon name="pin" :size="10" />
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
      <span class="flex items-center gap-1" :class="post.liked ? 'text-primary' : ''">
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
