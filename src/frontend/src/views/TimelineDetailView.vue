<!--
  大事记详情页（Elk 详情阅读流 + 中栏吸底评论栏）
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
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

const timelineId = route.params.id as string;

const loading = shallowRef(true);
const error = shallowRef(false);
const event = ref<TimelineEvent | null>(null);

const comments = ref<PostInfo[]>([]);
const commentsLoading = shallowRef(false);
const commentsError = shallowRef(false);

const liked = shallowRef(false);
const likeCount = shallowRef(0);
const likeBusy = shallowRef(false);

const replyTarget = ref<PostInfo | null>(null);
const submittingComment = shallowRef(false);
const composerEl = ref<InstanceType<typeof CommentComposer> | null>(null);

const composerPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 @${replyTarget.value.author?.username ?? "匿名用户"}…`
    : "写下你的评论…（支持 Markdown）"
);

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

function requireLogin(): boolean {
  if (auth.isLoggedIn) return true;
  void router.push({ path: "/login", query: { redirect: route.fullPath } });
  return false;
}

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

async function onSubmitComment(content: string, authorVisible: boolean): Promise<void> {
  if (!requireLogin()) return;
  submittingComment.value = true;
  try {
    if (replyTarget.value) {
      await createComment(replyTarget.value.id, content, authorVisible);
    } else {
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

function onReply(comment: PostInfo): void {
  replyTarget.value = comment;
  composerEl.value?.focus();
}

function cancelReply(): void {
  replyTarget.value = null;
}

function onCommentDeleted(id: string): void {
  comments.value = comments.value.filter((c) => c.id !== id);
}

onMounted(load);
</script>

<template>
  <div class="flex min-h-[calc(100dvh-var(--header-height)-1.5rem)] flex-col">
    <div class="flex-1">
      <LoadingSpinner v-if="loading" />
      <ErrorState v-else-if="error" message="大事记不存在或无权访问" @retry="load" />

      <template v-else-if="event">
        <!-- 正文阅读区 -->
        <article class="border-b border-subtle px-4 pb-5 pt-4 sm:px-6">
          <div class="flex items-center gap-2">
            <span class="tag-pill-accent">
              <AppSvgIcon name="calendar" :size="12" />
              大事记
            </span>
            <time
              class="ml-auto text-xs font-medium tabular-nums text-ink-muted"
              :datetime="event.eventDate"
            >
              事件日期：{{ formatDate(event.eventDate) }}
            </time>
          </div>

          <h1 class="mt-3 text-[20px] font-bold leading-[30px] tracking-tight text-ink sm:text-[22px]">
            {{ event.title }}
          </h1>

          <div class="mt-3">
            <MarkdownRenderer :content="event.description" size="reading" />
          </div>

          <!-- 提交与审核元信息（浅底色辅助块，无嵌套边框） -->
          <div class="mt-4 space-y-1 rounded-lg bg-canvas-soft px-3.5 py-2.5 text-xs text-ink-muted">
            <p>
              提交人：<span class="text-ink-secondary">{{ event.submittedBy ?? "匿名用户" }}</span>
              · <span class="tabular-nums">{{ formatDateTime(event.createdAt) }}</span>
            </p>
            <p v-if="event.reviewedBy || event.reviewedAt">
              审核人：<span class="text-ink-secondary">{{ event.reviewedBy ?? "—" }}</span>
              <template v-if="event.reviewedAt">
                · <span class="tabular-nums">{{ formatDateTime(event.reviewedAt) }}</span>
              </template>
            </p>
          </div>

          <!-- 操作行 -->
          <div class="mt-4 flex items-center gap-5 border-t border-subtle pt-3 text-xs tabular-nums text-ink-muted">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-hover hover:text-primary pressable"
              :class="liked ? 'font-medium text-primary' : ''"
              :disabled="likeBusy"
              @click="onToggleLike"
            >
              <AppSvgIcon name="thumbUp" :size="16" />
              {{ formatNumber(likeCount) }}
            </button>
            <span class="inline-flex items-center gap-1.5 px-1 py-1">
              <AppSvgIcon name="comment" :size="16" />
              {{ formatNumber(comments.length) }}
            </span>
          </div>
        </article>

        <!-- 评论区 -->
        <section>
          <div class="border-b border-subtle px-4 py-3 sm:px-6">
            <h2 class="text-sm font-semibold text-ink">
              全部评论
              <span class="ml-1 font-normal tabular-nums text-ink-muted">
                {{ comments.length }}
              </span>
            </h2>
          </div>

          <LoadingSpinner v-if="commentsLoading && comments.length === 0" />
          <ErrorState
            v-else-if="commentsError && comments.length === 0"
            message="评论加载失败"
            @retry="loadComments"
          />
          <template v-else>
            <div v-if="comments.length > 0">
              <CommentItem
                v-for="comment in comments"
                :key="comment.id"
                :comment="comment"
                @reply="onReply"
                @deleted="onCommentDeleted"
              />
            </div>
            <EmptyState
              v-else-if="!commentsLoading"
              text="还没有评论"
              description="分享你对这段校园记忆的看法吧。"
              icon="comment"
            />
          </template>
        </section>
      </template>
    </div>

    <!-- 中栏吸底评论栏 -->
    <div
      v-if="event"
      class="sticky bottom-0 z-20 -mb-6 border-t border-subtle px-3 pt-2.5 backdrop-blur-md sm:px-5"
      style="
        background-color: color-mix(in srgb, var(--bg-canvas) 92%, transparent);
        padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
      "
    >
      <div
        v-if="replyTarget"
        class="mb-2 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-xs text-primary"
      >
        <span class="truncate">
          回复 @{{ replyTarget.author?.username ?? "匿名用户" }}
        </span>
        <button
          type="button"
          class="ml-auto shrink-0 rounded-full p-0.5 hover:bg-hover"
          aria-label="取消回复"
          @click="cancelReply"
        >
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
  </div>
</template>
