<!--
  帖子详情页（Elk 详情阅读流）

  改造亮点：
    - 去除正文、评论区与输入框的双层卡片套娃
    - 主标题 20px–22px/30px font-bold，正文 15px / 1.7 阅读行高
    - 置顶 / 编辑 / 删除 / 复制链接收口至 AppDropdown（reka-ui DropdownMenu）
    - 删除二次确认接入 ConfirmDialog（reka-ui AlertDialog）
    - 吸底评论框改为中栏内 sticky bottom-0，桌面端完美贴合 660px 中栏宽度
    - 保留 data-tour="post-actions" 与 ImageLightbox 大图查看
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownRenderer from "../components/markdown/MarkdownRenderer.vue";
import ImageLightbox from "../components/common/ImageLightbox.vue";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import EmptyState from "../components/common/EmptyState.vue";
import AppDropdown, { type DropdownItem } from "../components/common/AppDropdown.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import CommentItem from "../components/post/CommentItem.vue";
import CommentComposer from "../components/post/CommentComposer.vue";
import FollowButton from "../components/user/FollowButton.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import { extractImageUrls } from "../utils/markdownImages";
import {
  getPost,
  getComments,
  createComment,
  updatePost,
  deletePost,
  togglePinPost,
} from "../api/post";
import { toggleLike } from "../api/like";
import { getFollowStatus } from "../api/follow";
import { getUserProfile } from "../api/user";
import { getBlockDetail } from "../api/block";
import { formatDateTime, formatNumber } from "../utils/format";
import { showToast } from "../utils/toast";
import { confirmAction } from "../composables/useConfirm";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions } from "../utils/myPermissions";
import {
  hasPermission,
  PERM_PIN_POST,
  PERM_EDIT_OTHERS_POST,
  PERM_DELETE_OTHERS_POST,
  BLOCK_PERM_PIN_POST,
} from "../utils/permission";
import type { PostInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 帖子 ID（兼容 /post/:id 与 /post?id=xxx） */
const postId = (route.params.id as string) || (route.query.id as string) || "";

const loading = shallowRef(true);
const error = shallowRef(false);
const post = ref<PostInfo | null>(null);

const comments = ref<PostInfo[]>([]);
const commentsLoading = shallowRef(false);
const commentsError = shallowRef(false);

const liked = shallowRef(false);
const likeCount = shallowRef(0);
const likeBusy = shallowRef(false);

const following = shallowRef<boolean | null>(null);
const authorQuestionBoxEnabled = shallowRef<boolean | null>(null);
const blockName = shallowRef<string | null>(null);
const blockPermissions = shallowRef<string | null>(null);

const editing = shallowRef(false);
const editContent = shallowRef("");
const savingEdit = shallowRef(false);
const deleting = shallowRef(false);
const pinning = shallowRef(false);

const bodyImages = computed(() => extractImageUrls(post.value?.content));
const lightboxOpen = shallowRef(false);
const lightboxIndex = shallowRef(0);

function onContentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target || target.tagName !== "IMG") return;

  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;

  const imgs = [...container.querySelectorAll("img")];
  const clicked = imgs.indexOf(target as HTMLImageElement);
  const urls = bodyImages.value;
  if (urls.length === 0) return;

  const src = (target as HTMLImageElement).getAttribute("src") ?? "";
  const bySrc = urls.indexOf(src);
  lightboxIndex.value = bySrc >= 0 ? bySrc : Math.max(0, Math.min(clicked, urls.length - 1));
  lightboxOpen.value = true;
}

const myPermissions = shallowRef<string>("0");

const canPin = computed(
  () =>
    hasPermission(myPermissions.value, PERM_PIN_POST) ||
    (blockPermissions.value !== null &&
      hasPermission(blockPermissions.value, BLOCK_PERM_PIN_POST))
);

const isAuthor = computed(
  () => Boolean(post.value?.authorId) && post.value?.authorId === auth.userId
);

const canEdit = computed(
  () => isAuthor.value || hasPermission(myPermissions.value, PERM_EDIT_OTHERS_POST)
);

const canDelete = computed(
  () => isAuthor.value || hasPermission(myPermissions.value, PERM_DELETE_OTHERS_POST)
);

const moreMenuItems = computed<DropdownItem[]>(() => {
  const list: DropdownItem[] = [
    { key: "share", label: "复制链接", icon: "copy" },
  ];
  if (canPin.value) {
    list.push({
      key: "pin",
      label: post.value?.isPinned ? "取消置顶" : "置顶帖子",
      icon: "pin",
      disabled: pinning.value,
      separatorBefore: true,
    });
  }
  if (canEdit.value && !editing.value) {
    list.push({
      key: "edit",
      label: "编辑正文",
      icon: "edit",
      separatorBefore: !canPin.value,
    });
  }
  if (canDelete.value) {
    list.push({
      key: "delete",
      label: deleting.value ? "删除中…" : "删除帖子",
      icon: "trash",
      danger: true,
      disabled: deleting.value,
      separatorBefore: true,
    });
  }
  return list;
});

const replyTarget = ref<PostInfo | null>(null);
const submittingComment = shallowRef(false);
const composerEl = ref<InstanceType<typeof CommentComposer> | null>(null);

const composerPlaceholder = computed(() =>
  replyTarget.value
    ? `回复 @${replyTarget.value.author?.username ?? "匿名用户"}…`
    : "写下你的评论…（支持 Markdown）"
);

const authorName = computed(() => post.value?.author?.username ?? "匿名用户");

const authorProfileLink = computed(() => {
  const author = post.value?.author;
  return author?.id
    ? { name: "user-profile" as const, params: { id: author.id } }
    : null;
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getPost(postId);
    post.value = data;
    liked.value = data.liked ?? false;
    likeCount.value = data.likeCount ?? 0;
    void loadComments();
    void loadRelations();
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
    comments.value = await getComments(postId);
  } catch {
    commentsError.value = true;
  } finally {
    commentsLoading.value = false;
  }
}

async function loadRelations(): Promise<void> {
  const p = post.value;
  if (!p) return;

  if (p.authorId && p.authorId !== auth.userId && auth.isLoggedIn) {
    try {
      const status = await getFollowStatus(p.authorId);
      following.value = status.following;
    } catch {
      following.value = null;
    }
  }

  if (p.authorId) {
    try {
      const profile = await getUserProfile(p.authorId);
      authorQuestionBoxEnabled.value = profile.questionBoxEnabled;
    } catch {
      authorQuestionBoxEnabled.value = false;
    }
  }

  if (p.blockId) {
    try {
      const block = await getBlockDetail(p.blockId);
      blockName.value = block.name;
      blockPermissions.value = block.myPermissions;
    } catch {
      blockName.value = null;
    }
  }

  myPermissions.value = await getMyPermissions();
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
    const result = await toggleLike("post", postId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

function startEdit(): void {
  if (!post.value) return;
  editContent.value = post.value.content;
  editing.value = true;
}

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

async function onDelete(): Promise<void> {
  if (deleting.value) return;
  const confirmed = await confirmAction({
    title: "确定删除这篇帖子吗？",
    description: "删除后将无法恢复，评论也将一并不可见。",
    confirmText: "删除帖子",
    variant: "danger",
  });
  if (!confirmed) return;

  deleting.value = true;
  try {
    await deletePost(postId);
    showToast("帖子已删除", "success");
    void router.replace({ name: "home" });
  } catch {
    deleting.value = false;
  }
}

async function onTogglePin(): Promise<void> {
  if (!post.value || pinning.value) return;
  pinning.value = true;
  try {
    const result = await togglePinPost(postId);
    post.value.isPinned = result.pinned;
    showToast(result.pinned ? "已置顶" : "已取消置顶", "success");
  } catch {
    // client.ts 已自动 Toast
  } finally {
    pinning.value = false;
  }
}

async function copyShareLink(): Promise<void> {
  const url = `${window.location.origin}/post/${postId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("帖子链接已复制", "success");
  } catch {
    showToast("复制失败，请手动复制地址栏链接", "error");
  }
}

function onSelectMenu(key: string): void {
  if (key === "share") void copyShareLink();
  else if (key === "pin") void onTogglePin();
  else if (key === "edit") startEdit();
  else if (key === "delete") void onDelete();
}

async function onSubmitComment(content: string, authorVisible: boolean): Promise<void> {
  if (!requireLogin()) return;
  submittingComment.value = true;
  try {
    const parentId = replyTarget.value?.id ?? postId;
    await createComment(parentId, content, authorVisible);
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
      <ErrorState v-else-if="error" message="帖子不存在或无权访问" @retry="load" />

      <template v-else-if="post">
        <!-- 帖子阅读正文区（无卡片边框，通透排版） -->
        <article class="border-b border-subtle px-4 pb-5 pt-4 sm:px-6">
          <!-- 作者行 -->
          <div class="flex items-center gap-2.5">
            <RouterLink v-if="authorProfileLink" :to="authorProfileLink" class="shrink-0">
              <UserAvatar
                :src="post.author?.avatar"
                :name="authorName"
                :name-color="post.author?.nameColor"
                :anonymous="!post.author"
                size="lg"
              />
            </RouterLink>
            <UserAvatar v-else :name="authorName" anonymous size="lg" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <RouterLink
                  v-if="authorProfileLink"
                  :to="authorProfileLink"
                  class="truncate text-[15px] font-semibold text-ink hover:underline"
                  :style="{ color: post.author?.nameColor ?? undefined }"
                >
                  {{ authorName }}
                </RouterLink>
                <span v-else class="truncate text-[15px] font-semibold text-ink-secondary">
                  {{ authorName }}
                </span>
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
              </div>
              <time
                class="block text-xs tabular-nums text-ink-muted"
                :datetime="post.createdAt"
              >
                {{ formatDateTime(post.createdAt) }}
              </time>
            </div>

            <!-- 作者关联操作：提问箱 + 关注 -->
            <div class="flex shrink-0 items-center gap-2">
              <RouterLink
                v-if="post.authorId && authorQuestionBoxEnabled"
                :to="{ name: 'question-box', params: { userId: post.authorId } }"
                class="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-hover hover:text-ink pressable"
              >
                <AppSvgIcon name="helpCircle" :size="14" />
                提问箱
              </RouterLink>
              <FollowButton
                v-if="post.authorId && post.authorId !== auth.userId"
                :user-id="post.authorId"
                :following="following ?? false"
                @change="(next: boolean) => (following = next)"
              />
            </div>
          </div>

          <!-- 所属板块标签 -->
          <RouterLink
            v-if="blockName && post.blockId"
            :to="{ name: 'block-detail', params: { id: post.blockId } }"
            class="tag-pill mt-3 hover:text-primary"
          >
            <AppSvgIcon name="blocks" :size="12" />
            {{ blockName }}
          </RouterLink>

          <!-- 详情主标题（DESIGN.md: 20px–22px / 30px font-bold） -->
          <h1
            v-if="post.title"
            class="mt-3 text-[20px] font-bold leading-[30px] tracking-tight text-ink sm:text-[22px]"
          >
            {{ post.title }}
          </h1>

          <!-- 正文：阅读模式 / 编辑模式 -->
          <div
            v-if="!editing"
            class="post-body mt-3 cursor-zoom-in"
            @click="onContentClick"
          >
            <MarkdownRenderer :content="post.content" size="reading" />
          </div>
          <div v-else class="mt-3">
            <textarea
              v-model="editContent"
              class="input-base min-h-[168px] resize-y leading-relaxed"
              maxlength="1000"
            />
            <div class="mt-2.5 flex items-center justify-end gap-2">
              <span class="mr-auto text-xs tabular-nums text-ink-muted">
                {{ editContent.length }}/1000
              </span>
              <button
                type="button"
                class="btn-secondary !py-1.5 text-sm"
                @click="editing = false"
              >
                取消
              </button>
              <button
                type="button"
                class="btn-primary !py-1.5 text-sm"
                :disabled="savingEdit"
                @click="saveEdit"
              >
                {{ savingEdit ? "保存中…" : "保存修改" }}
              </button>
            </div>
          </div>

          <!-- 操作栏（保留 data-tour="post-actions"） -->
          <div
            data-tour="post-actions"
            class="mt-5 flex items-center gap-5 border-t border-subtle pt-3 text-xs tabular-nums text-ink-muted"
          >
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
              {{ formatNumber(post.commentCount ?? comments.length) }}
            </span>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-hover hover:text-primary pressable"
              aria-label="分享帖子"
              @click="copyShareLink"
            >
              <AppSvgIcon name="share" :size="15" />
              分享
            </button>

            <div class="ml-auto">
              <AppDropdown
                :items="moreMenuItems"
                trigger-label="帖子更多操作"
                @select="onSelectMenu"
              />
            </div>
          </div>
        </article>

        <!-- 评论区（无套娃卡片，直接 1px 分割线时间轴） -->
        <section>
          <div class="flex items-center justify-between border-b border-subtle px-4 py-3 sm:px-6">
            <h2 class="text-sm font-semibold text-ink">
              全部评论
              <span class="ml-1 font-normal tabular-nums text-ink-muted">
                {{ post.commentCount ?? comments.length }}
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
              description="发表第一条评论开启讨论吧。"
              icon="comment"
            />
          </template>
        </section>
      </template>
    </div>

    <!-- 中栏吸底评论输入栏（sticky bottom-0 完美贴合 660px 中栏与移动端全宽） -->
    <div
      v-if="post"
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

    <!-- 大图查看（reka-ui Dialog 灯箱） -->
    <ImageLightbox
      :open="lightboxOpen"
      :urls="bodyImages"
      :index="lightboxIndex"
      @update:index="lightboxIndex = $event"
      @close="lightboxOpen = false"
    />
  </div>
</template>

<style scoped>
.post-body :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 0.5rem;
  margin: 0.65rem 0;
  background: var(--bg-canvas-soft);
}
</style>
