<!--
  帖子详情页

  功能：
    - 帖子正文（Markdown 渲染）+ 作者信息（用户名 + 颜色，匿名显示「匿名」）
    - 点赞 / 取消赞（/api/like）
    - 关注 / 取消关注作者（/api/follow）
    - 编辑 / 删除（仅作者本人或对应管理权限者可见）
    - 置顶（仅探测到 pin_post 权限者可见）
    - 评论区：树状（最多 3 层）、点赞、回复定位、删除、Markdown 输入
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
import {
  getPost,
  getComments,
  createComment,
  updatePost,
  deletePost,
  togglePinPost,
} from "../api/post";
import { toggleLike } from "../api/like";
import { followUser, unfollowUser, getFollowStatus } from "../api/follow";
import { getBlockDetail } from "../api/block";
import { formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import {
  hasPermission,
  PERM_PIN_POST,
  PERM_EDIT_OTHERS_POST,
  PERM_DELETE_OTHERS_POST,
} from "../utils/permission";
import type { PostInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 帖子 ID（兼容 /post/:id 与 /post?id=xxx 两种形式） */
const postId = (route.params.id as string) || (route.query.id as string) || "";

// ------------------------------------------------------------
//  数据状态
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const post = ref<PostInfo | null>(null);

/** 评论列表（顶级） */
const comments = ref<PostInfo[]>([]);
const commentsLoading = ref(false);
const commentsError = ref(false);

/** 点赞本地状态（加载后由后端附加字段初始化） */
const liked = ref(false);
const likeCount = ref(0);
const likeBusy = ref(false);

/** 关注状态（null = 未知 / 不可关注） */
const following = ref<boolean | null>(null);
const followBusy = ref(false);

/** 所属板块名（blockId 存在时查询） */
const blockName = ref<string | null>(null);

// ------------------------------------------------------------
//  编辑 / 删除 / 置顶
// ------------------------------------------------------------

const editing = ref(false);
const editContent = ref("");
const savingEdit = ref(false);
const deleting = ref(false);
const pinning = ref(false);

/** 权限探测结果（十进制掩码字符串） */
const myPermissions = ref<string>("0");
/** 是否有 pin_post 权限（置顶按钮可见性） */
const canPin = computed(() => hasPermission(myPermissions.value, PERM_PIN_POST));

/** 是否作者本人（匿名帖 authorId 为 null，任何人都不视为作者） */
const isAuthor = computed(
  () => !!post.value?.authorId && post.value.authorId === auth.userId
);

/** 编辑按钮可见：作者本人 或 持有 edit_others_post 权限 */
const canEdit = computed(
  () => isAuthor.value || hasPermission(myPermissions.value, PERM_EDIT_OTHERS_POST)
);

/** 删除按钮可见：作者本人 或 持有 delete_others_post 权限 */
const canDelete = computed(
  () => isAuthor.value || hasPermission(myPermissions.value, PERM_DELETE_OTHERS_POST)
);

// ------------------------------------------------------------
//  评论输入
// ------------------------------------------------------------

/** 回复目标（null = 直接评论帖子） */
const replyTarget = ref<PostInfo | null>(null);
const submittingComment = ref(false);
const composerEl = ref<InstanceType<typeof CommentComposer> | null>(null);

/** 输入框占位文案 */
const composerPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 @${replyTarget.value.author?.username ?? "匿名用户"}…`
    : "写下你的评论…（支持 Markdown）"
);

/** 作者显示名 */
const authorName = computed(() => post.value?.author?.username ?? "匿名");

/** 头像占位首字 */
const avatarChar = computed(() => authorName.value.slice(0, 1));

// ------------------------------------------------------------
//  加载
// ------------------------------------------------------------

/** 加载帖子详情 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getPost(postId);
    post.value = data;
    liked.value = data.liked ?? false;
    likeCount.value = data.likeCount ?? 0;
    // 并行发起附属查询（失败不影响正文展示）
    void loadComments();
    void loadRelations();
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
    comments.value = await getComments(postId);
  } catch {
    commentsError.value = true;
  } finally {
    commentsLoading.value = false;
  }
}

/** 加载关注状态 / 板块名 / 权限探测（静默，互不阻塞） */
async function loadRelations(): Promise<void> {
  const p = post.value;
  if (!p) return;

  // 关注状态：有作者、非本人、已登录时查询
  if (p.authorId && p.authorId !== auth.userId && auth.isLoggedIn) {
    try {
      const status = await getFollowStatus(p.authorId);
      following.value = status.following;
    } catch {
      following.value = null;
    }
  }

  // 板块名
  if (p.blockId) {
    try {
      const block = await getBlockDetail(p.blockId);
      blockName.value = block.name;
    } catch {
      blockName.value = null;
    }
  }

  // 权限探测（决定置顶 / 管理按钮可见性）
  myPermissions.value = await getMyPermissions();
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
    const result = await toggleLike("post", postId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

/** 关注 / 取消关注作者 */
async function onToggleFollow(): Promise<void> {
  const authorId = post.value?.authorId;
  if (!authorId || !requireLogin() || followBusy.value) return;
  followBusy.value = true;
  try {
    if (following.value) {
      await unfollowUser(authorId);
      following.value = false;
      showToast("已取消关注", "success");
    } else {
      await followUser(authorId);
      following.value = true;
      showToast("关注成功", "success");
    }
  } catch {
    // client.ts 已自动 Toast
  } finally {
    followBusy.value = false;
  }
}

/** 进入编辑模式 */
function startEdit(): void {
  if (!post.value) return;
  editContent.value = post.value.content;
  editing.value = true;
}

/** 保存编辑 */
async function saveEdit(): Promise<void> {
  if (!post.value || savingEdit.value) return;
  const content = editContent.value.trim();
  if (!content) {
    showToast("内容不能为空", "error");
    return;
  }
  savingEdit.value = true;
  try {
    await updatePost(post.value.id, content);
    post.value.content = content;
    editing.value = false;
    showToast("已保存", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    savingEdit.value = false;
  }
}

/** 删除帖子（二次确认） */
async function onDelete(): Promise<void> {
  if (!window.confirm("确定删除这篇帖子吗？删除后不可恢复。")) return;
  if (deleting.value) return;
  deleting.value = true;
  try {
    await deletePost(postId);
    showToast("帖子已删除", "success");
    router.replace({ name: "home" });
  } catch {
    deleting.value = false;
  }
}

/** 置顶 / 取消置顶 */
async function onTogglePin(): Promise<void> {
  if (!post.value || pinning.value) return;
  pinning.value = true;
  try {
    await togglePinPost(postId);
    post.value.isPinned = !post.value.isPinned;
    showToast(post.value.isPinned ? "已置顶" : "已取消置顶", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    pinning.value = false;
  }
}

/** 提交评论（或回复） */
async function onSubmitComment(content: string, authorVisible: boolean): Promise<void> {
  if (!requireLogin()) return;
  submittingComment.value = true;
  try {
    const parentId = replyTarget.value?.id ?? postId;
    await createComment(parentId, content, authorVisible);
    showToast("评论成功", "success");
    replyTarget.value = null;
    // 重新加载顶级评论（子回复由 CommentItem 懒加载管理）
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
    <ErrorState v-else-if="error" message="帖子不存在或无权访问" @retry="load" />

    <template v-else-if="post">
      <!-- 正文卡片 -->
      <article class="card-base">
        <!-- 作者行 -->
        <div class="mb-3 flex items-center gap-2">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            :style="
              post.author?.nameColor
                ? {
                    color: post.author.nameColor,
                    background: 'color-mix(in srgb, ' + post.author.nameColor + ' 14%, transparent)',
                  }
                : undefined
            "
            :class="post.author ? 'bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)]' : 'bg-line text-ink-soft'"
          >
            {{ avatarChar }}
          </span>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span
                class="truncate text-sm font-semibold"
                :style="{ color: post.author?.nameColor ?? undefined }"
              >
                {{ authorName }}
              </span>
              <span
                v-if="post.author?.badge"
                class="shrink-0 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1 text-[10px] text-primary"
              >
                {{ post.author.badge }}
              </span>
            </div>
            <div class="text-[11px] text-ink-soft">{{ formatDateTime(post.createdAt) }}</div>
          </div>

          <!-- 关注按钮（有作者且非本人） -->
          <button
            v-if="post.authorId && post.authorId !== auth.userId"
            type="button"
            class="ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-opacity active:opacity-70 disabled:opacity-50"
            :class="following ? 'bg-line text-ink-soft' : 'bg-primary text-white'"
            :disabled="followBusy || following === null"
            @click="onToggleFollow"
          >
            {{ following === null ? "…" : following ? "已关注" : "关注" }}
          </button>
        </div>

        <!-- 板块标签 -->
        <div
          v-if="blockName"
          class="mb-2 inline-flex items-center gap-1 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1.5 py-0.5 text-[11px] text-primary"
        >
          <AppSvgIcon name="blocks" :size="11" />
          {{ blockName }}
        </div>

        <!-- 标题 -->
        <h1 v-if="post.title" class="mb-2 text-lg font-bold">{{ post.title }}</h1>

        <!-- 正文：查看 / 编辑 -->
        <MarkdownRenderer v-if="!editing" :content="post.content" />
        <div v-else>
          <textarea
            v-model="editContent"
            class="min-h-[160px] w-full resize-y rounded-lg bg-page px-3 py-2 text-sm outline-none"
            maxlength="1000"
          />
          <div class="mt-2 flex items-center justify-end gap-2">
            <span class="mr-auto text-[10px] text-ink-soft">{{ editContent.length }}/1000</span>
            <button type="button" class="btn-secondary !py-1.5 text-sm" @click="editing = false">
              取消
            </button>
            <button
              type="button"
              class="btn-primary !py-1.5 text-sm disabled:opacity-50"
              :disabled="savingEdit"
              @click="saveEdit"
            >
              {{ savingEdit ? "保存中…" : "保存" }}
            </button>
          </div>
        </div>

        <!-- 操作行 -->
        <div class="mt-4 flex items-center gap-4 border-t border-line pt-3 text-xs text-ink-soft">
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
            {{ formatNumber(post.commentCount ?? comments.length) }}
          </span>

          <span class="ml-auto flex items-center gap-3">
            <button
              v-if="canPin"
              type="button"
              class="flex items-center gap-1 transition-colors"
              :class="post.isPinned ? 'text-accent' : ''"
              :disabled="pinning"
              @click="onTogglePin"
            >
              <AppSvgIcon name="pin" :size="15" />
              {{ post.isPinned ? "取消置顶" : "置顶" }}
            </button>
            <button
              v-if="canEdit && !editing"
              type="button"
              class="flex items-center gap-1"
              @click="startEdit"
            >
              <AppSvgIcon name="edit" :size="15" />
              编辑
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
          </span>
        </div>
      </article>

      <!-- 评论区 -->
      <section class="mt-3">
        <h3 class="mb-1 px-1 text-sm font-semibold text-ink-soft">
          评论（{{ post.commentCount ?? comments.length }}）
        </h3>

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
