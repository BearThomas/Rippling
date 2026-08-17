<!--
  大事记详情页（/timeline/:id）

  功能：
    - 详情：标题 / 事件日期 / 描述（Markdown 渲染）/ 提交人 / 点赞数
    - 审核信息（reviewedBy / reviewedAt，后端按权限附加，有才显示）
    - 点赞 / 取消赞（/api/like targetType=timeline）
    - 评论区（targetType=timeline）：复用 CommentItem / CommentComposer，
      顶级评论走 /api/timeline/comments + /api/timeline/comment，
      子回复仍走 /api/post/comment（父评论是 post 行）
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import EmptyState from "../components/common/EmptyState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import CommentItem from "../components/post/CommentItem.vue";
import CommentComposer from "../components/post/CommentComposer.vue";
import { getTimelineDetail, getTimelineComments, createTimelineComment } from "../api/timeline";
import { createComment } from "../api/post";
import { toggleLike } from "../api/like";
import { formatDate, formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { TimelineEvent, PostInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 大事记 ID */
const timelineId = route.params.id as string;

// ------------------------------------------------------------
//  数据状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const event = ref<TimelineEvent | null>(null);

/** 评论列表（顶级） */
const comments = ref<PostInfo[]>([]);
const commentsLoading = ref(false);
const commentsError = ref(false);

/** 点赞本地状态（列表 / 详情不返回是否已赞，默认未赞） */
const liked = ref(false);
const likeCount = ref(0);
const likeBusy = ref(false);

// ------------------------------------------------------------
//  评论输入
// ------------------------------------------------------------

/** 回复目标（null = 直接评论大事记） */
const replyTarget = ref<PostInfo | null>(null);
const submittingComment = ref(false);
const composerEl = ref<InstanceType<typeof CommentComposer> | null>(null);

/** 输入框占位文案 */
const composerPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 @${replyTarget.value.author?.username ?? "匿名用户"}…`
    : "写下你的评论…（支持 Markdown）"
);

// ------------------------------------------------------------
//  加载
// ------------------------------------------------------------

/** 加载大事记详情 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getTimelineDetail(timelineId);
    event.value = data;
    likeCount.value = data.likeCount ?? 0;
    void loadComments();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 加载顶级评论列表 */
async function loadComments(): Promise<void> {
  commentsLoading.value = true;
  commentsError.value = false;
  try {
    comments.value = await getTimelineComments(timelineId);
  } catch {
    commentsError.value = true;
  } finally {
    commentsLoading.value = false;
  }
}

// ------------------------------------------------------------
//  交互
// ------------------------------------------------------------

/** 未登录引导 */
function requireLogin(): boolean {
  if (auth.isLoggedIn) return true;
  router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

/** 点赞 / 取消赞 */
async function onToggleLike(): Promise<void> {
  if (!requireLogin() || likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("timeline", timelineId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

/** 提交评论（或回复） */
async function onSubmitComment(content: string, authorVisible: boolean): Promise<void> {
  if (!requireLogin()) return;
  submittingComment.value = true;
  try {
    if (replyTarget.value) {
      // 回复评论：父级是 post 行，走既有评论接口
      await createComment(replyTarget.value.id, content, authorVisible);
    } else {
      // 顶级评论：走大事记评论接口
      await createTimelineComment(timelineId, content, authorVisible);
    }
    showToast("评论成功", "success");
    replyTarget.value = null;
    await loadComments();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submittingComment.value = false;
  }
}

/** 点击评论的「回复」→ 定位输入框 */
function onReply(comment: PostInfo): void {
  replyTarget.value = comment;
  composerEl.value?.focus();
}

/** 取消回复定位 */
function cancelReply(): void {
  replyTarget.value = null;
}

/** 评论被删除 → 从顶级列表移除 */
function onCommentDeleted(id: string): void {
  comments.value = comments.value.filter((c) => c.id !== id);
}

onMounted(load);
</script>

<template>
  <div class="px-3 pb-44 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="大事记不存在或无权访问" @retry="load" />

    <template v-else-if="event">
      <!-- 正文卡片 -->
      <article class="card-base">
        <!-- 类型标签 + 事件日期 -->
        <div class="mb-2 flex items-center gap-2 text-xs text-ink-soft">
          <span class="flex items-center gap-1 font-medium text-primary">
            <AppSvgIcon name="calendar" :size="14" />
            大事记
          </span>
          <span class="ml-auto">事件日期：{{ formatDate(event.eventDate) }}</span>
        </div>

        <!-- 标题 -->
        <h1 class="mb-2 text-lg font-bold">{{ event.title }}</h1>

        <!-- 描述（Markdown 渲染） -->
        <MarkdownRenderer :content="event.description" />

        <!-- 提交信息 -->
        <div class="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
          <p>提交人：{{ event.submittedBy ?? "匿名用户" }} · {{ formatDateTime(event.createdAt) }}</p>
          <!-- 审核信息（后端按权限附加） -->
          <p v-if="event.reviewedBy || event.reviewedAt" class="mt-1">
            审核人：{{ event.reviewedBy ?? "—" }}
            <template v-if="event.reviewedAt"> · {{ formatDateTime(event.reviewedAt) }}</template>
          </p>
        </div>

        <!-- 操作行 -->
        <div class="mt-3 flex items-center gap-4 border-t border-line pt-3 text-xs text-ink-soft">
          <button
            type="button"
            class="flex items-center gap-1 transition-colors"
            :class="liked ? 'text-primary' : ''"
            :disabled="likeBusy"
            @click="onToggleLike"
          >
            <AppSvgIcon name="thumbUp" :size="16" />
            {{ formatNumber(likeCount) }}
          </button>
          <span class="flex items-center gap-1">
            <AppSvgIcon name="comment" :size="16" />
            {{ formatNumber(comments.length) }}
          </span>
        </div>
      </article>

      <!-- 评论区 -->
      <section class="mt-3">
        <h3 class="mb-1 px-1 text-sm font-semibold text-ink-soft">评论（{{ comments.length }}）</h3>

        <LoadingSpinner v-if="commentsLoading && comments.length === 0" />
        <ErrorState
          v-else-if="commentsError && comments.length === 0"
          message="评论加载失败"
          @retry="loadComments"
        />
        <template v-else>
          <div class="card-base divide-y divide-line !py-1">
            <CommentItem
              v-for="comment in comments"
              :key="comment.id"
              :comment="comment"
              @reply="onReply"
              @deleted="onCommentDeleted"
            />
          </div>
          <EmptyState v-if="comments.length === 0 && !commentsLoading" text="还没有评论，来抢沙发" icon="comment" />
        </template>
      </section>

      <!-- 底部评论输入栏（固定） -->
      <div class="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-app bg-page px-3 pb-3 pt-2">
        <!-- 回复提示 -->
        <div
          v-if="replyTarget"
          class="mb-1.5 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--c-primary)_8%,transparent)] px-3 py-1.5 text-xs text-primary"
        >
          回复 @{{ replyTarget.author?.username ?? "匿名用户" }}
          <button type="button" class="ml-auto" aria-label="取消回复" @click="cancelReply">
            <AppSvgIcon name="close" :size="14" />
          </button>
        </div>
        <CommentComposer
          ref="composerEl"
          :placeholder="composerPlaceholder"
          :busy="submittingComment"
          @submit="onSubmitComment"
        />
      </div>
    </template>
  </div>
</template>
