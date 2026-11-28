<!--
  评论详情页（Elk 阅读流 + 轻量父级链背景区 + 中栏吸底回复框）
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
import UserAvatar from "../components/user/UserAvatar.vue";
import { getPost, getComments, createComment, deletePost } from "../api/post";
import { toggleLike } from "../api/like";
import { formatDateTime, formatNumber, truncateText } from "../utils/format";
import { showToast } from "../utils/toast";
import { confirmAction } from "../composables/useConfirm";
import { useAuthStore } from "../stores/auth";
import type { PostInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const commentId = (route.params.id as string) || (route.query.id as string) || "";

const loading = shallowRef(true);
const error = shallowRef(false);
const comment = ref<PostInfo | null>(null);
const chain = ref<PostInfo[]>([]);

const replies = ref<PostInfo[]>([]);
const repliesLoading = shallowRef(false);

const liked = shallowRef(false);
const likeCount = shallowRef(0);
const likeBusy = shallowRef(false);
const submitting = shallowRef(false);
const deleting = shallowRef(false);

const canDelete = computed(
  () => Boolean(comment.value?.authorId) && comment.value?.authorId === auth.userId
);
const authorName = computed(() => comment.value?.author?.username ?? "匿名用户");
const authorProfileLink = computed(() => {
  const author = comment.value?.author;
  return author?.id
    ? { name: "user-profile" as const, params: { id: author.id } }
    : null;
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getPost(commentId);
    comment.value = data;
    liked.value = data.liked ?? false;
    likeCount.value = data.likeCount ?? 0;
    void loadChain(data.parentId);
    void loadReplies();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadChain(startParentId: string | null): Promise<void> {
  const nodes: PostInfo[] = [];
  let cursor = startParentId;
  for (let i = 0; i < 6 && cursor; i++) {
    try {
      const parent = await getPost(cursor);
      nodes.unshift(parent);
      cursor = parent.parentId;
    } catch {
      break;
    }
  }
  chain.value = nodes;
}

async function loadReplies(): Promise<void> {
  repliesLoading.value = true;
  try {
    replies.value = await getComments(commentId);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    repliesLoading.value = false;
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
    const result = await toggleLike("comment", commentId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

async function onSubmit(content: string, authorVisible: boolean): Promise<void> {
  if (!requireLogin()) return;
  submitting.value = true;
  try {
    await createComment(commentId, content, authorVisible);
    showToast("回复成功", "success");
    await loadReplies();
  } catch {
    // client.ts 已自动 Toast
  } finally {
    submitting.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (deleting.value) return;
  const confirmed = await confirmAction({
    title: "确定删除这条评论吗？",
    description: "删除后将无法恢复。",
    confirmText: "删除",
    variant: "danger",
  });
  if (!confirmed) return;

  deleting.value = true;
  try {
    await deletePost(commentId);
    showToast("评论已删除", "success");
    void router.replace({ name: "home" });
  } catch {
    deleting.value = false;
  }
}

function openChainNode(node: PostInfo): void {
  if (!node.parentId) {
    void router.push({ name: "post-detail", params: { id: node.id } });
  } else {
    void router.push({ name: "comment-detail", params: { id: node.id } });
  }
}

function chainNodeText(node: PostInfo): string {
  if (!node.parentId) {
    return node.title ?? truncateText(node.content, 48);
  }
  return `${node.author?.username ?? "匿名用户"}：${truncateText(node.content, 48)}`;
}

onMounted(load);
</script>

<template>
  <div class="flex min-h-[calc(100dvh-var(--header-height)-1.5rem)] flex-col">
    <div class="flex-1">
      <LoadingSpinner v-if="loading" />
      <ErrorState v-else-if="error" message="评论不存在或无权访问" @retry="load" />

      <template v-else-if="comment">
        <!-- 父级上下文链（浅底色引用条，无嵌套卡片框） -->
        <nav
          v-if="chain.length > 0"
          class="space-y-2 border-b border-subtle bg-canvas-soft px-4 py-3 sm:px-6"
          aria-label="上下文"
        >
          <button
            v-for="node in chain"
            :key="node.id"
            type="button"
            class="block w-full rounded-lg border-l-[3px] border-strong bg-surface px-3 py-2 text-left hover:bg-hover pressable"
            @click="openChainNode(node)"
          >
            <span class="flex items-center gap-1 text-xs font-medium text-primary">
              <AppSvgIcon :name="node.parentId ? 'comment' : 'file'" :size="12" />
              {{ node.parentId ? "上级评论" : "原帖" }}
            </span>
            <p class="mt-0.5 truncate text-xs text-ink-secondary">
              {{ chainNodeText(node) }}
            </p>
          </button>
        </nav>

        <!-- 当前评论正文 -->
        <article class="border-b border-subtle px-4 py-4 sm:px-6">
          <div class="flex items-center gap-2.5">
            <RouterLink v-if="authorProfileLink" :to="authorProfileLink" class="shrink-0">
              <UserAvatar
                :src="comment.author?.avatar"
                :name="authorName"
                :name-color="comment.author?.nameColor"
                :anonymous="!comment.author"
                size="md"
              />
            </RouterLink>
            <UserAvatar v-else :name="authorName" anonymous size="md" />

            <div class="min-w-0 flex-1">
              <RouterLink
                v-if="authorProfileLink"
                :to="authorProfileLink"
                class="block truncate text-sm font-semibold text-ink hover:underline"
                :style="{ color: comment.author?.nameColor ?? undefined }"
              >
                {{ authorName }}
              </RouterLink>
              <span v-else class="block truncate text-sm font-semibold text-ink-secondary">
                {{ authorName }}
              </span>
              <time
                class="block text-xs tabular-nums text-ink-muted"
                :datetime="comment.createdAt"
              >
                {{ formatDateTime(comment.createdAt) }}
              </time>
            </div>
          </div>

          <div class="mt-3">
            <MarkdownRenderer :content="comment.content" size="reading" />
          </div>

          <div class="mt-4 flex items-center gap-5 border-t border-subtle pt-3 text-xs tabular-nums text-ink-muted">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-hover hover:text-primary pressable"
              :class="liked ? 'font-medium text-primary' : ''"
              :disabled="likeBusy"
              @click="onToggleLike"
            >
              <AppSvgIcon name="thumbUp" :size="15" />
              {{ formatNumber(likeCount) }}
            </button>

            <button
              v-if="canDelete"
              type="button"
              class="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ink-muted hover:bg-danger-soft hover:text-danger pressable disabled:opacity-50"
              :disabled="deleting"
              @click="onDelete"
            >
              <AppSvgIcon name="trash" :size="14" />
              {{ deleting ? "删除中…" : "删除" }}
            </button>
          </div>
        </article>

        <!-- 回复列表 -->
        <section>
          <div class="border-b border-subtle px-4 py-3 sm:px-6">
            <h2 class="text-sm font-semibold text-ink">
              全部回复
              <span class="ml-1 font-normal tabular-nums text-ink-muted">
                {{ replies.length }}
              </span>
            </h2>
          </div>

          <LoadingSpinner v-if="repliesLoading" />
          <template v-else>
            <div v-if="replies.length > 0">
              <CommentItem
                v-for="reply in replies"
                :key="reply.id"
                :comment="reply"
                :depth="1"
                @deleted="loadReplies"
              />
            </div>
            <EmptyState v-else text="还没有回复" icon="comment" />
          </template>
        </section>
      </template>
    </div>

    <!-- 中栏吸底回复栏 -->
    <div
      v-if="comment"
      class="sticky bottom-0 z-20 -mb-6 border-t border-subtle px-3 pt-2.5 backdrop-blur-md sm:px-5"
      style="
        background-color: color-mix(in srgb, var(--bg-canvas) 92%, transparent);
        padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
      "
    >
      <CommentComposer
        placeholder="写下你的回复…（支持 Markdown）"
        :busy="submitting"
        @submit="onSubmit"
      />
    </div>
  </div>
</template>
