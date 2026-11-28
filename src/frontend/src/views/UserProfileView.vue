<!--
  用户主页（他人主页 + 我的页面整合 — Elk 简洁顶条 + 统计数字 + 下划线 AppTabs + 无边框动态流）

  路由 /user/:id（他人主页）与 /profile（我的页面）共用本组件：
  无路由参数时取当前登录用户 ID。
  保留 data-tour="profile-menu"、「设置」入口与「退出登录」直出行为以兼容引导与自动化检查。
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import UserCard from "../components/user/UserCard.vue";
import PostCard from "../components/post/PostCard.vue";
import { getUserProfile, getUserPosts, getUserComments } from "../api/user";
import { getMyVerification } from "../api/ticket";
import { useAuthStore } from "../stores/auth";
import { getMyPermissions, clearPermissionCache } from "../utils/myPermissions";
import { hasPermission, PERM_ACCESS_ADMIN_PANEL } from "../utils/permission";
import { formatRelativeTime, truncateText } from "../utils/format";
import { showToast } from "../utils/toast";
import type { UserPublicProfile, PostInfo } from "../types";

/** 分页大小 */
const PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 目标用户 ID：路由参数优先，/profile 时取自己 */
const targetUserId = computed(() => {
  const paramId = route.params.id as string | undefined;
  return paramId || auth.userId || "";
});

/** 是否查看自己 */
const isSelf = computed(
  () => Boolean(auth.userId) && targetUserId.value === auth.userId
);

// ------------------------------------------------------------
//  资料加载
// ------------------------------------------------------------

const loading = shallowRef(true);
const error = shallowRef(false);
const profile = ref<UserPublicProfile | null>(null);

/** 管理面板入口可见性（本人 + access_admin_panel 权限） */
const canAdmin = shallowRef(false);

/** 我的认证工单状态（用于"申请认证"入口智能跳转） */
const verificationStatus = ref<{
  exists: boolean;
  status: "pending" | "approved" | "rejected" | null;
  ticketId: string | null;
} | null>(null);

/** 认证状态简短标签 */
const verificationLabel = computed(() => {
  if (!verificationStatus.value?.exists) return "";
  switch (verificationStatus.value.status) {
    case "pending":
      return "审核中";
    case "approved":
      return "已认证";
    case "rejected":
      return "未通过";
    default:
      return "";
  }
});

/** 点击"申请认证"入口的处理 */
function handleVerificationClick(): void {
  if (!verificationStatus.value) return;
  const { exists, status, ticketId } = verificationStatus.value;

  if (!exists || status === "rejected") {
    void router.push("/ticket/create?type=verification");
    return;
  }

  if (status === "approved" && ticketId) {
    void router.push(`/ticket/${ticketId}`);
    return;
  }

  if (status === "pending") {
    showToast("认证审核中，请耐心等待", "info");
  }
}

async function loadProfile(): Promise<void> {
  loading.value = true;
  error.value = false;
  profile.value = null;
  try {
    profile.value = await getUserProfile(targetUserId.value);
    if (isSelf.value) {
      const mask = await getMyPermissions();
      canAdmin.value = hasPermission(mask, PERM_ACCESS_ADMIN_PANEL);
      try {
        verificationStatus.value = await getMyVerification();
      } catch {
        verificationStatus.value = null;
      }
    } else {
      canAdmin.value = false;
      verificationStatus.value = null;
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 关注状态切换成功 → 本地同步粉丝数 */
function onFollowChange(next: boolean): void {
  if (!profile.value) return;
  profile.value.followerCount += next ? 1 : -1;
}

// ------------------------------------------------------------
//  帖子 / 评论 Tab
// ------------------------------------------------------------

const activeTab = shallowRef<"posts" | "comments">("posts");

const posts = ref<PostInfo[]>([]);
const comments = ref<PostInfo[]>([]);
const postsHasMore = shallowRef(false);
const commentsHasMore = shallowRef(false);
const postsLoading = shallowRef(false);
const commentsLoading = shallowRef(false);
const commentsLoadedOnce = shallowRef(false);

const tabItems = computed<TabOption[]>(() => [
  {
    value: "posts",
    label: "帖子",
    count: posts.value.length > 0 ? posts.value.length : undefined,
  },
  {
    value: "comments",
    label: "评论",
    count: comments.value.length > 0 ? comments.value.length : undefined,
  },
]);

/** 加载帖子（reset 时从第一页开始） */
async function loadPosts(reset: boolean): Promise<void> {
  if (postsLoading.value) return;
  postsLoading.value = true;
  try {
    const offset = reset ? 0 : posts.value.length;
    const { posts: page } = await getUserPosts(targetUserId.value, PAGE_SIZE, offset);
    posts.value = reset ? page : posts.value.concat(page);
    postsHasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    postsLoading.value = false;
  }
}

/** 加载评论（reset 时从第一页开始） */
async function loadComments(reset: boolean): Promise<void> {
  if (commentsLoading.value) return;
  commentsLoading.value = true;
  try {
    const offset = reset ? 0 : comments.value.length;
    const { comments: page } = await getUserComments(
      targetUserId.value,
      PAGE_SIZE,
      offset
    );
    comments.value = reset ? page : comments.value.concat(page);
    commentsHasMore.value = page.length === PAGE_SIZE;
    commentsLoadedOnce.value = true;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    commentsLoading.value = false;
  }
}

/** 切换 Tab（懒加载：首次切入才拉取） */
function onTabChange(next: string): void {
  const tab = next === "comments" ? "comments" : "posts";
  activeTab.value = tab;
  if (tab === "posts" && posts.value.length === 0) void loadPosts(true);
  if (tab === "comments" && !commentsLoadedOnce.value) void loadComments(true);
}

/** 评论行点击 → 评论详情 */
function openComment(id: string): void {
  void router.push({ name: "comment-detail", params: { id } });
}

// ------------------------------------------------------------
//  本人操作
// ------------------------------------------------------------

const signingOut = shallowRef(false);

/** 退出登录（可逆操作，不弹确认框以兼容一键登出流程） */
async function handleSignOut(): Promise<void> {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await auth.signOut();
    clearPermissionCache();
    showToast("已退出登录", "success");
    void router.push("/login");
  } finally {
    signingOut.value = false;
  }
}

/** 加载全部（资料 + 当前 Tab 内容） */
async function loadAll(): Promise<void> {
  activeTab.value = "posts";
  commentsLoadedOnce.value = false;
  await loadProfile();
  if (!error.value) {
    await loadPosts(true);
    comments.value = [];
    commentsHasMore.value = false;
  }
}

watch(targetUserId, (next, prev) => {
  if (next && next !== prev) void loadAll();
});

watch(
  () => auth.username,
  (next, prev) => {
    if (next && prev && next !== prev && isSelf.value) {
      void loadAll();
    }
  }
);

onMounted(() => {
  if (targetUserId.value) void loadAll();
  else loading.value = false;
});
</script>

<template>
  <div>
    <FeedSkeleton v-if="loading" variant="elk" :count="4" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="loadAll" />
    </div>

    <template v-else-if="profile">
      <!-- 用户头部（顶条 + 头像 + 统计） -->
      <UserCard :profile="profile" :is-self="isSelf" @follow-change="onFollowChange">
        <template v-if="isSelf" #actions>
          <RouterLink
            to="/settings"
            class="btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
          >
            <AppSvgIcon name="settings" :size="14" />
            <span>设置</span>
          </RouterLink>
          <RouterLink
            :to="{ name: 'question-box', params: { userId: profile.userId } }"
            class="btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
          >
            <AppSvgIcon name="inbox" :size="14" />
            <span>管理提问箱</span>
          </RouterLink>
        </template>
      </UserCard>

      <!-- 他人：提问箱入口（启用时显示） -->
      <RouterLink
        v-if="!isSelf && profile.questionBoxEnabled"
        :to="{ name: 'question-box', params: { userId: profile.userId } }"
        class="flex w-full items-center gap-3 border-b border-subtle px-4 py-3.5 text-sm text-ink hover:bg-hover pressable sm:px-5"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary"
          aria-hidden="true"
        >
          <AppSvgIcon name="inbox" :size="16" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-medium text-ink">匿名提问箱</span>
          <span class="block text-xs text-ink-muted">向 {{ profile.username }} 匿名提问</span>
        </span>
        <AppSvgIcon name="chevronRight" :size="16" class="shrink-0 text-ink-muted" />
      </RouterLink>

      <!-- 本人：Elk 无边框分割行菜单（保留 data-tour="profile-menu"） -->
      <nav
        v-if="isSelf"
        data-tour="profile-menu"
        aria-label="个人功能菜单"
        class="border-b border-subtle divide-y divide-[var(--border-subtle)]"
      >
        <RouterLink
          to="/tickets"
          class="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-hover pressable sm:px-5"
        >
          <AppSvgIcon name="file" :size="17" class="shrink-0 text-ink-muted" />
          <span class="min-w-0 flex-1">我的工单</span>
          <AppSvgIcon name="chevronRight" :size="15" class="shrink-0 text-ink-muted" />
        </RouterLink>

        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-hover pressable sm:px-5"
          @click="handleVerificationClick"
        >
          <AppSvgIcon name="check" :size="17" class="shrink-0 text-ink-muted" />
          <span class="min-w-0 flex-1">申请认证</span>
          <span v-if="verificationLabel" class="tag-pill shrink-0">
            {{ verificationLabel }}
          </span>
          <AppSvgIcon name="chevronRight" :size="15" class="shrink-0 text-ink-muted" />
        </button>

        <RouterLink
          v-if="canAdmin"
          to="/admin"
          class="flex w-full items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-hover pressable sm:px-5"
        >
          <AppSvgIcon name="shield" :size="17" class="shrink-0 text-ink-muted" />
          <span class="min-w-0 flex-1">管理面板</span>
          <AppSvgIcon name="chevronRight" :size="15" class="shrink-0 text-ink-muted" />
        </RouterLink>

        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-danger hover:bg-danger-soft pressable disabled:opacity-50 sm:px-5"
          :disabled="signingOut"
          @click="handleSignOut"
        >
          <AppSvgIcon name="logout" :size="17" class="shrink-0" />
          <span class="min-w-0 flex-1">{{ signingOut ? "退出中…" : "退出登录" }}</span>
        </button>
      </nav>

      <!-- 下划线 AppTabs（帖子 / 评论） -->
      <AppTabs
        :model-value="activeTab"
        :items="tabItems"
        variant="underline"
        stretch
        aria-label="用户内容分类"
        @update:model-value="onTabChange"
      />

      <!-- 帖子流（Elk 无边框 1px 分割线） -->
      <div v-show="activeTab === 'posts'" class="pb-6">
        <PostCard v-for="post in posts" :key="post.id" :post="post" />
        <FeedSkeleton v-if="postsLoading && posts.length === 0" variant="elk" :count="3" />
        <div v-else-if="posts.length === 0" class="px-4 py-4">
          <EmptyState text="还没有发过帖子" icon="file" />
        </div>
        <div v-if="postsHasMore" class="px-4 py-4 text-center">
          <button
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="postsLoading"
            @click="loadPosts(false)"
          >
            {{ postsLoading ? "加载中…" : "加载更多" }}
          </button>
        </div>
      </div>

      <!-- 评论流（Elk 无边框 1px 分割线，点赞图标使用 thumbUp） -->
      <div v-show="activeTab === 'comments'" class="pb-6">
        <button
          v-for="comment in comments"
          :key="comment.id"
          type="button"
          class="block w-full border-b border-subtle px-4 py-3.5 text-left hover:bg-hover pressable sm:px-5"
          @click="openComment(comment.id)"
        >
          <p class="text-[14.5px] leading-relaxed text-ink break-words">
            {{ truncateText(comment.content, 140) }}
          </p>
          <div class="mt-2 flex items-center gap-4 text-xs text-ink-muted">
            <span class="inline-flex items-center gap-1 tabular-nums">
              <AppSvgIcon name="thumbUp" :size="13" />
              {{ comment.likeCount ?? 0 }}
            </span>
            <time :datetime="comment.createdAt" class="tabular-nums">
              {{ formatRelativeTime(comment.createdAt) }}
            </time>
          </div>
        </button>

        <FeedSkeleton v-if="commentsLoading && comments.length === 0" variant="elk" :count="3" />
        <div v-else-if="comments.length === 0" class="px-4 py-4">
          <EmptyState text="还没有发过评论" icon="comment" />
        </div>
        <div v-if="commentsHasMore" class="px-4 py-4 text-center">
          <button
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="commentsLoading"
            @click="loadComments(false)"
          >
            {{ commentsLoading ? "加载中…" : "加载更多" }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
