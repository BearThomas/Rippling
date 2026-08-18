<!--
  评论项组件（递归）

  展示：作者头像占位、用户名 + 颜色、时间、内容（Markdown）、
  点赞（可交互）、回复、删除（仅作者本人可见）。

  树状规则：评论嵌套最多 3 层，超过 3 层的回复以同层深度平铺渲染。
  子评论懒加载：点击「展开 N 条回复」时调用 GET /api/post/comments。
-->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppSvgIcon from "../layout/AppSvgIcon.vue";
import MarkdownRenderer from "../markdown/MarkdownRenderer.vue";
import { formatRelativeTime, formatNumber } from "../../utils/format";
import { getComments, deletePost } from "../../api/post";
import { toggleLike } from "../../api/like";
import { showToast } from "../../utils/toast";
import { useAuthStore } from "../../stores/auth";
import type { PostInfo } from "../../types";

const props = withDefaults(
  defineProps<{
    /** 评论数据（后端已附加 author / likeCount / liked） */
    comment: PostInfo;
    /** 当前嵌套深度（1 起，3 为上限） */
    depth?: number;
  }>(),
  { depth: 1 }
);

const emit = defineEmits<{
  /** 点击回复按钮 */
  reply: [comment: PostInfo];
  /** 评论被删除 */
  deleted: [id: string];
}>();

const router = useRouter();
const auth = useAuthStore();

/** 点赞本地状态（初始值来自后端附加字段） */
const liked = ref(props.comment.liked ?? false);
const likeCount = ref(props.comment.likeCount ?? 0);
const likeBusy = ref(false);

/** 子回复懒加载状态 */
const children = ref<PostInfo[] | null>(null);
const childrenLoading = ref(false);

/** 删除中状态 */
const deleting = ref(false);

/** 是否可删除：仅作者本人（管理员删除能力依赖权限接口，暂未提供） */
const canDelete = auth.userId != null && props.comment.authorId === auth.userId;

/** 子评论嵌套深度：超过 3 层后保持 3 层（平铺展示） */
const childDepth = Math.min(props.depth + 1, 3);

/** 作者显示名 */
const authorName = props.comment.author?.username ?? "匿名用户";

/** 头像占位首字 */
const avatarChar = authorName.slice(0, 1);

/** 切换点赞 */
async function onToggleLike(): Promise<void> {
  if (!auth.isLoggedIn) {
    router.push({ path: "/login", query: { redirect: router.currentRoute.value.fullPath } });
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

/** 懒加载子回复 */
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

/** 收起子回复 */
function collapseChildren(): void {
  children.value = null;
}

/** 删除评论（二次确认） */
async function onDelete(): Promise<void> {
  if (!window.confirm("确定删除这条评论吗？")) return;
  if (deleting.value) return;
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

/** 点击评论内容 → 评论详情页 */
function openCommentDetail(): void {
  router.push({ name: "comment-detail", params: { id: props.comment.id } });
}
</script>

<template>
  <div class="py-2.5" :class="depth > 1 ? 'border-l-2 border-line pl-3' : ''">
    <!-- 作者行 -->
    <div class="mb-1 flex items-center gap-2">
      <!-- 头像（有头像显示图片，否则首字占位；匿名用灰色） -->
      <img
        v-if="comment.author?.avatar"
        :src="comment.author.avatar"
        :alt="authorName"
        class="h-6 w-6 shrink-0 rounded-full object-cover"
      />
      <span
        v-else
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
        :style="
          comment.author?.nameColor
            ? {
                color: comment.author.nameColor,
                background: 'color-mix(in srgb, ' + comment.author.nameColor + ' 14%, transparent)',
              }
            : undefined
        "
        :class="comment.author ? '' : 'bg-line text-ink-soft'"
      >
        {{ avatarChar }}
      </span>
      <span
        class="truncate text-sm font-medium"
        :style="{ color: comment.author?.nameColor ?? undefined }"
      >
        {{ authorName }}
      </span>
      <span class="ml-auto shrink-0 text-[11px] text-ink-soft">
        {{ formatRelativeTime(comment.createdAt) }}
      </span>
    </div>

    <!-- 内容（点击进入评论详情） -->
    <div
      class="cursor-pointer rounded-md transition-opacity active:opacity-70"
      @click="openCommentDetail"
    >
      <MarkdownRenderer :content="comment.content" />
    </div>

    <!-- 操作行 -->
    <div class="mt-1.5 flex items-center gap-4 text-xs text-ink-soft">
      <button
        type="button"
        class="flex items-center gap-1 transition-colors"
        :class="liked ? 'text-primary' : ''"
        @click="onToggleLike"
      >
        <AppSvgIcon name="thumbUp" :size="13" />
        {{ formatNumber(likeCount) }}
      </button>
      <button
        type="button"
        class="flex items-center gap-1 transition-colors active:text-primary"
        @click="emit('reply', comment)"
      >
        <AppSvgIcon name="comment" :size="13" />
        回复
      </button>
      <button
        v-if="canDelete"
        type="button"
        class="flex items-center gap-1 text-red-400 transition-opacity active:opacity-60"
        :disabled="deleting"
        @click="onDelete"
      >
        <AppSvgIcon name="trash" :size="13" />
        {{ deleting ? "删除中…" : "删除" }}
      </button>
    </div>

    <!-- 子回复区 -->
    <div v-if="(comment.commentCount ?? 0) > 0 || children" class="mt-1">
      <button
        v-if="!children"
        type="button"
        class="flex items-center gap-1 py-1 text-xs text-primary"
        :disabled="childrenLoading"
        @click="loadChildren"
      >
        <AppSvgIcon name="chevronDown" :size="13" />
        {{ childrenLoading ? "加载中…" : `展开 ${comment.commentCount ?? 0} 条回复` }}
      </button>

      <template v-else>
        <button
          type="button"
          class="flex items-center gap-1 py-1 text-xs text-ink-soft"
          @click="collapseChildren"
        >
          <AppSvgIcon name="chevronUp" :size="13" />
          收起回复
        </button>
        <div v-if="children.length === 0" class="py-1 text-xs text-ink-soft">暂无回复</div>
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
