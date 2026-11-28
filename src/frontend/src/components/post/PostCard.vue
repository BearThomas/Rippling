<!--
  帖子信息流行（Elk 无边框 1px 分割线风格）

  层级结构（DESIGN.md 第 3、6 节）：
    - 顶行：作者头像 + 昵称（名字色）+ 轻量徽章/置顶胶囊 + 相对时间
    - 标题：15px–16px font-semibold，最多 2 行
    - 摘要：14px 柔和正文，最多 3 行（break-words 避免英文单词硬截断）
    - 配图：PostImageStrip 横滑缩略图
    - 底栏：低对比度点赞 / 评论 / 分享操作栏，悬停才显强调色
-->
<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import PostImageStrip from "./PostImageStrip.vue";
import UserAvatar from "../user/UserAvatar.vue";
import { extractImageUrls, hasTextBesidesImages } from "../../utils/markdownImages";
import { formatRelativeTime, formatNumber, truncateText } from "../../utils/format";
import { showToast } from "../../utils/toast";
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

const isAnonymous = computed(() => !props.post.author);
const authorName = computed(() => props.post.author?.username ?? "匿名用户");

const authorProfileLink = computed(() => {
  const author = props.post.author;
  return author?.id
    ? { name: "user-profile" as const, params: { id: author.id } }
    : null;
});

/** Markdown 转纯文本摘要（截断上限配合 CSS line-clamp-3 保持行高齐整） */
const preview = computed(() => {
  const plain = props.post.content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateText(plain, 160);
});

const imageUrls = computed(() => extractImageUrls(props.post.content));
const hasText = computed(() => hasTextBesidesImages(props.post.content));

function openDetail(): void {
  void router.push({ name: "post-detail", params: { id: props.post.id } });
}

async function copyShareLink(): Promise<void> {
  const url = `${window.location.origin}/post/${props.post.id}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("帖子链接已复制", "success");
  } catch {
    showToast("复制失败，请手动复制地址栏链接", "error");
  }
}
</script>

<template>
  <article
    class="feed-row-interactive"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <!-- 作者与元信息行 -->
    <div class="flex items-center gap-2">
      <RouterLink
        v-if="authorProfileLink"
        :to="authorProfileLink"
        class="flex min-w-0 items-center gap-2 hover:underline"
        @click.stop
      >
        <UserAvatar
          :src="post.author?.avatar"
          :name="authorName"
          :name-color="post.author?.nameColor"
          :anonymous="isAnonymous"
          size="sm"
        />
        <span
          class="truncate text-sm font-semibold text-ink"
          :style="{ color: post.author?.nameColor ?? undefined }"
        >
          {{ authorName }}
        </span>
      </RouterLink>

      <template v-else>
        <UserAvatar :name="authorName" anonymous size="sm" />
        <span class="truncate text-sm font-medium text-ink-secondary">{{ authorName }}</span>
      </template>

      <span
        v-if="post.author?.badge"
        class="tag-pill-accent !px-2 !py-0 text-[11px]"
      >
        {{ post.author.badge }}
      </span>

      <span
        v-if="post.isPinned"
        class="tag-pill-warm !px-2 !py-0 text-[11px]"
      >
        <AppSvgIcon name="pin" :size="11" />
        置顶
      </span>

      <time
        class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
        :datetime="post.createdAt"
      >
        {{ formatRelativeTime(post.createdAt) }}
      </time>
    </div>

    <!-- 正文区（与头像视觉对齐：左侧微缩进让扫视更利落） -->
    <div class="mt-2 sm:pl-9">
      <h3
        v-if="post.title"
        class="mb-1 line-clamp-2 text-[15px] font-semibold leading-[22px] text-ink sm:text-base"
      >
        {{ post.title }}
      </h3>

      <p
        v-if="hasText"
        class="line-clamp-3 break-words text-sm leading-6 text-ink-secondary"
      >
        {{ preview }}
      </p>

      <PostImageStrip :urls="imageUrls" @open="openDetail" />

      <!-- 底部低对比度操作栏（悬停显现强调色） -->
      <div class="mt-2.5 flex items-center gap-5 text-xs tabular-nums text-ink-muted">
        <span
          class="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
          :class="post.liked ? 'font-medium text-primary' : ''"
        >
          <AppSvgIcon name="thumbUp" :size="15" />
          {{ formatNumber(post.likeCount ?? 0) }}
        </span>
        <span class="inline-flex items-center gap-1.5 transition-colors hover:text-primary">
          <AppSvgIcon name="comment" :size="15" />
          {{ formatNumber(post.commentCount ?? 0) }}
        </span>
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink-muted hover:bg-hover hover:text-primary pressable"
          aria-label="分享链接"
          @click.stop="copyShareLink"
        >
          <AppSvgIcon name="share" :size="14" />
        </button>
      </div>
    </div>
  </article>
</template>
