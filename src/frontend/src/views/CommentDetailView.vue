<!--
  评论详情页

  展示单条评论及其父级链（帖子 → 父评论 → … → 当前评论），
  支持点赞、回复（底部输入栏）、删除（作者本人）。
  回复列表复用 CommentItem（懒加载嵌套）。
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
import { getPost, getComments, createComment, deletePost } from "../api/post";
import { toggleLike } from "../api/like";
import { formatDateTime, formatNumber, truncateText } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import type { PostInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 评论 ID（兼容 /comment/:id 与 /comment?id=xxx） */
const commentId = (route.params.id as string) || (route.query.id as string) || "";

/** 父级链遍历上限（防止脏数据导致死循环） */
const MAX_CHAIN_DEPTH = 10;

// ------------------------------------------------------------
//  状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);

/** 当前评论 */
const comment = ref<PostInfo | null>(null);
/** 父级链：根帖子在前、直接父级在后（不含当前评论） */
const chain = ref<PostInfo[]>([]);

/** 回复列表 */
const replies = ref<PostInfo[]>([]);
const repliesLoading = ref(false);

/** 点赞本地状态 */
const liked = ref(false);
const likeCount = ref(0);
const likeBusy = ref(false);

/** 提交回复状态 */
const submitting = ref(false);
const deleting = ref(false);

/** 是否作者本人（删除按钮可见性） */
const canDelete = computed(
  () => !!comment.value?.authorId && comment.value.authorId === auth.userId
);

/** 作者显示名 */
const authorName = computed(() => comment.value?.author?.username ?? "匿名用户");

// ------------------------------------------------------------
//  加载
// ------------------------------------------------------------

/** 加载评论 + 父级链 + 回复 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const current = await getPost(commentId);
    comment.value = current;
    liked.value = current.liked ?? false;
    likeCount.value = current.likeCount ?? 0;

    // 向上遍历父级链（依次 getPost，最多 MAX_CHAIN_DEPTH 层）
    const parents: PostInfo[] = [];
    let parentId = current.parentId;
    let guard = 0;
    while (parentId && guard < MAX_CHAIN_DEPTH) {
      const parent = await getPost(parentId);
      parents.unshift(parent);
      parentId = parent.parentId;
      guard += 1;
    }
    chain.value = parents;

    void loadReplies();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 加载回复列表 */
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
    const result = await toggleLike("comment", commentId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

/** 提交回复 */
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

/** 删除评论（二次确认）→ 返回父级页面 */
async function onDelete(): Promise<void> {
  if (!window.confirm("确定删除这条评论吗？")) return;
  if (deleting.value) return;
  deleting.value = true;
  try {
    await deletePost(commentId);
    showToast("评论已删除", "success");
    const parent = chain.value[chain.value.length - 1];
    if (parent && !parent.parentId) {
      router.replace({ name: "post-detail", params: { id: parent.id } });
    } else if (parent) {
      router.replace({ name: "comment-detail", params: { id: parent.id } });
    } else {
      router.replace({ name: "home" });
    }
  } catch {
    deleting.value = false;
  }
}

/** 点击父级链节点跳转 */
function openChainNode(node: PostInfo): void {
  if (!node.parentId) {
    router.push({ name: "post-detail", params: { id: node.id } });
  } else {
    router.push({ name: "comment-detail", params: { id: node.id } });
  }
}

/** 父级链节点摘要文本 */
function chainNodeText(node: PostInfo): string {
  if (!node.parentId) {
    return node.title ?? truncateText(node.content, 40);
  }
  return `${node.author?.username ?? "匿名用户"}：${truncateText(node.content, 40)}`;
}

onMounted(load);
</script>

<template>
  <div class="px-3 pb-44 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="评论不存在或无权访问" @retry="load" />

    <template v-else-if="comment">
      <!-- 父级链（帖子 → … → 父评论） -->
      <nav v-if="chain.length > 0" class="mb-3 space-y-1.5">
        <button
          v-for="node in chain"
          :key="node.id"
          type="button"
          class="card-base block w-full !p-2.5 text-left text-xs text-ink-soft transition-opacity active:opacity-70"
          @click="openChainNode(node)"
        >
          <span class="mb-0.5 flex items-center gap-1 text-[10px] text-primary">
            <AppSvgIcon :name="node.parentId ? 'comment' : 'file'" :size="11" />
            {{ node.parentId ? "父评论" : "原帖" }}
          </span>
          {{ chainNodeText(node) }}
        </button>
      </nav>

      <!-- 当前评论 -->
      <article class="card-base">
        <div class="mb-2 flex items-center gap-2">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            :style="
              comment.author?.nameColor
                ? {
                    color: comment.author.nameColor,
                    background: 'color-mix(in srgb, ' + comment.author.nameColor + ' 14%, transparent)',
                  }
                : undefined
            "
            :class="comment.author ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]' : 'bg-line text-ink-soft'"
          >
            {{ authorName.slice(0, 1) }}
          </span>
          <span
            class="truncate text-sm font-medium"
            :style="{ color: comment.author?.nameColor ?? undefined }"
          >
            {{ authorName }}
          </span>
          <span class="ml-auto shrink-0 text-xs text-ink-soft">
            {{ formatDateTime(comment.createdAt) }}
          </span>
        </div>

        <MarkdownRenderer :content="comment.content" />

        <!-- 操作行 -->
        <div class="mt-3 flex items-center gap-4 text-xs text-ink-soft">
          <button
            type="button"
            class="flex items-center gap-1 transition-colors"
            :class="liked ? 'text-primary' : ''"
            :disabled="likeBusy"
            @click="onToggleLike"
          >
            <AppSvgIcon name="thumbUp" :size="15" />
            {{ formatNumber(likeCount) }}
          </button>
          <button
            v-if="canDelete"
            type="button"
            class="flex items-center gap-1 text-red-400"
            :disabled="deleting"
            @click="onDelete"
          >
            <AppSvgIcon name="trash" :size="15" />
            {{ deleting ? "删除中…" : "删除" }}
          </button>
        </div>
      </article>

      <!-- 回复列表 -->
      <section class="mt-3">
        <h3 class="mb-1 px-1 text-sm font-semibold text-ink-soft">回复（{{ replies.length }}）</h3>
        <LoadingSpinner v-if="repliesLoading" />
        <template v-else>
          <div v-if="replies.length > 0" class="card-base divide-y divide-line !py-1">
            <CommentItem
              v-for="reply in replies"
              :key="reply.id"
              :comment="reply"
              :depth="2"
              @deleted="loadReplies"
            />
          </div>
          <EmptyState v-else text="还没有回复" icon="comment" />
        </template>
      </section>

      <!-- 底部回复输入栏 -->
      <div class="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-app bg-page px-3 pb-3 pt-2">
        <CommentComposer
          placeholder="写下你的回复…（支持 Markdown）"
          :busy="submitting"
          @submit="onSubmit"
        />
      </div>
    </template>
  </div>
</template>
