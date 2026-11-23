<!--
  评论项组件（Elk 扁平时间轴 / 最多 2 层视觉轻量缩进）

  - 保持逻辑上最多 3 层嵌套与子回复懒加载不变
  - 删除确认改用全局 ConfirmDialog（reka-ui AlertDialog），替代原生 window.confirm
-->
<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import MarkdownRenderer from "../markdown/MarkdownRenderer.vue";
import UserAvatar from "../user/UserAvatar.vue";
import { formatRelativeTime, formatNumber } from "../../utils/format";
import { getComments, deletePost } from "../../api/post";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { confirmAction } from "../../composables/useConfirm";
import { useAuthStore } from "../../stores/auth";
import type { PostInfo } from "../../types";

const props = withDefaults(
  defineProps<{
    /** 评论数据（后端已附加 author / likeCount / liked） */
    comment: PostInfo;
    /** 当前嵌套深度（1 起，逻辑 3 为上限；视觉缩进最多 2 层） */
    depth?: number;
  }>(),
  { depth: 1 }
);

const emit = defineEmits<{
  reply: [comment: PostInfo];
  deleted: [id: string];
}>();

const router = useRouter();
const auth = useAuthStore();

const liked = shallowRef(props.comment.liked ?? false);
const likeCount = shallowRef(props.comment.likeCount ?? 0);
const likeBusy = shallowRef(false);

const children = ref<PostInfo[] | null>(null);
const childrenLoading = shallowRef(false);
const deleting = shallowRef(false);

const canDelete = computed(
  () => auth.userId != null && props.comment.authorId === auth.userId
);
const childDepth = computed(() => Math.min(props.depth + 1, 3));
const authorName = computed(() => props.comment.author?.username ?? "匿名用户");

const authorProfileLink = computed(() => {
  const author = props.comment.author;
  return author?.id
    ? { name: "user-profile" as const, params: { id: author.id } }
    : null;
});

async function onToggleLike(): Promise<void> {
  if (!auth.isLoggedIn) {
    void router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
    return;
  }
  if (likeBusy.value) return;
  likeBusy.value = true;
  try {
    const result = await toggleLike("comment", props.comment.id);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    showToast("点赞失败，请稍后重试", "error");
  } finally {
    likeBusy.value = false;
  }
}

async function loadChildren(): Promise<void> {
  if (children.value || childrenLoading.value) return;
  childrenLoading.value = true;
  try {
    children.value = await getComments(props.comment.id);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    childrenLoading.value = false;
  }
}

function collapseChildren(): void {
  children.value = null;
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
    await deletePost(props.comment.id);
    showToast("评论已删除", "success");
    emit("deleted", props.comment.id);
  } catch {
    // client.ts 已自动 Toast
  } finally {
    deleting.value = false;
  }
}

function openCommentDetail(): void {
  void router.push({ name: "comment-detail", params: { id: props.comment.id } });
}
</script>

<template>
  <div
    :class="
      depth === 1
        ? 'border-b border-subtle px-4 py-3.5 sm:px-6'
        : depth === 2
          ? 'mt-2.5 border-l-2 border-subtle pl-3.5 pt-1'
          : 'mt-2.5 pt-1'
    "
  >
    <!-- 作者与时间 -->
    <div class="flex items-center gap-2">
      <RouterLink
        v-if="authorProfileLink"
        :to="authorProfileLink"
        class="flex min-w-0 items-center gap-2 hover:underline"
        @click.stop
      >
        <UserAvatar
          :src="comment.author?.avatar"
          :name="authorName"
          :name-color="comment.author?.nameColor"
          size="xs"
        />
        <span
          class="truncate text-sm font-medium text-ink"
          :style="{ color: comment.author?.nameColor ?? undefined }"
        >
          {{ authorName }}
        </span>
      </RouterLink>

      <template v-else>
        <UserAvatar :name="authorName" anonymous size="xs" />
        <span class="truncate text-sm font-medium text-ink-secondary">{{ authorName }}</span>
      </template>

      <time
        class="ml-auto shrink-0 text-xs tabular-nums text-ink-muted"
        :datetime="comment.createdAt"
      >
        {{ formatRelativeTime(comment.createdAt) }}
      </time>
    </div>

    <!-- 正文（点击进入评论详情） -->
    <div
      class="mt-1.5 cursor-pointer rounded-lg py-0.5 text-ink-secondary transition-colors hover:text-ink"
      :class="depth === 1 ? 'sm:pl-8' : ''"
      @click="openCommentDetail"
    >
      <MarkdownRenderer :content="comment.content" size="compact" />
    </div>

    <!-- 低对比度操作栏 -->
    <div
      class="mt-1.5 flex items-center gap-4 text-xs tabular-nums text-ink-muted"
      :class="depth === 1 ? 'sm:pl-8' : ''"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1 hover:text-primary pressable"
        :class="liked ? 'font-medium text-primary' : ''"
        :disabled="likeBusy"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="13" />
        {{ formatNumber(likeCount) }}
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-1 hover:text-ink pressable"
        @click="emit('reply', comment)"
      >
        <AppSvgIcon name="comment" :size="13" />
        回复
      </button>

      <button
        v-if="canDelete"
        type="button"
        class="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-danger pressable disabled:opacity-50"
        :disabled="deleting"
        @click="onDelete"
      >
        <AppSvgIcon name="trash" :size="13" />
        {{ deleting ? "删除中…" : "删除" }}
      </button>
    </div>

    <!-- 子回复区 -->
    <div
      v-if="(comment.commentCount ?? 0) > 0 || children"
      class="mt-1.5"
      :class="depth === 1 ? 'sm:pl-8' : ''"
    >
      <button
        v-if="!children"
        type="button"
        class="inline-flex items-center gap-1 py-1 text-xs font-medium text-primary hover:underline"
        :disabled="childrenLoading"
        @click="loadChildren"
      >
        <AppSvgIcon name="chevronDown" :size="13" />
        {{ childrenLoading ? "加载中…" : `展开 ${comment.commentCount ?? 0} 条回复` }}
      </button>

      <template v-else>
        <button
          type="button"
          class="inline-flex items-center gap-1 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
          @click="collapseChildren"
        >
          <AppSvgIcon name="chevronUp" :size="13" />
          收起回复
        </button>
        <div v-if="children.length === 0" class="py-1 text-xs text-ink-muted">暂无回复</div>
        <CommentItem
          v-for="child in children"
          :key="child.id"
          :comment="child"
          :depth="childDepth"
          @reply="emit('reply', $event)"
          @deleted="loadChildren"
        />
      </template>
    </div>
  </div>
</template>
