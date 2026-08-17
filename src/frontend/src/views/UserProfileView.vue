<!--
  用户主页（他人主页 + 我的页面整合）

  路由 /user/:id（他人主页）与 /profile（我的页面）共用本组件：
  无路由参数时取当前登录用户 ID。

  结构：用户信息卡片 → 提问箱入口 →（本人：功能菜单）→ 帖子 / 评论 Tab（分页）。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import UserCard from "../components/user/UserCard.vue";
import PostCard from "../components/post/PostCard.vue";
import { getUserProfile, getUserPosts, getUserComments } from "../api/user";
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
  () => !!auth.userId && targetUserId.value === auth.userId
);

// ------------------------------------------------------------
//  资料加载
// ------------------------------------------------------------

const loading = ref(true);
const error = ref(false);
const profile = ref<UserPublicProfile | null>(null);

/** 管理面板入口可见性（本人 + access_admin_panel 权限） */
const canAdmin = ref(false);

async function loadProfile(): Promise<void> {
  loading.value = true;
  error.value = false;
  profile.value = null;
  try {
    profile.value = await getUserProfile(targetUserId.value);
    // 本人时探测管理面板权限（静默）
    if (isSelf.value) {
      const mask = await getMyPermissions();
      canAdmin.value = hasPermission(mask, PERM_ACCESS_ADMIN_PANEL);
    } else {
      canAdmin.value = false;
    }
  } catch {
    error.value = true; // client.ts 已自动 Toast
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

const activeTab = ref<"posts" | "comments">("posts");

const posts = ref<PostInfo[]>([]);
const comments = ref<PostInfo[]>([]);
const postsHasMore = ref(false);
const commentsHasMore = ref(false);
const postsLoading = ref(false);
const commentsLoading = ref(false);

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
  } catch {
    // client.ts 已自动 Toast
  } finally {
    commentsLoading.value = false;
  }
}

/** 切换 Tab（懒加载：首次切入才拉取） */
function switchTab(tab: "posts" | "comments"): void {
  activeTab.value = tab;
  if (tab === "posts" && posts.value.length === 0) loadPosts(true);
  if (tab === "comments" && comments.value.length === 0) loadComments(true);
}

/** 评论卡片点击 → 评论详情 */
function openComment(id: string): void {
  router.push({ name: "comment-detail", params: { id } });
}

// ------------------------------------------------------------
//  本人操作
// ------------------------------------------------------------

/** 退出登录 */
async function handleSignOut(): Promise<void> {
  await auth.signOut();
  clearPermissionCache();
  showToast("已退出登录", "success");
  router.push("/login");
}

/** 加载全部（资料 + 当前 Tab 内容） */
async function loadAll(): Promise<void> {
  await loadProfile();
  if (!error.value) {
    await loadPosts(true);
    // 评论列表懒加载：默认 Tab 为帖子
    comments.value = [];
    commentsHasMore.value = false;
  }
}

// 切换用户（如从我的页面进入他人主页）时重新加载
watch(targetUserId, (next, prev) => {
  if (next && next !== prev) loadAll();
});

onMounted(() => {
  if (targetUserId.value) loadAll();
  else loading.value = false; // 未登录访问 /profile，显示登录引导
});
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 未登录访问 /profile：登录引导 -->
    <div v-if="auth.loaded && !auth.isLoggedIn && !targetUserId" class="card-base text-center">
      <p class="mb-4 text-sm text-ink-soft">登录后体验完整功能</p>
      <RouterLink to="/login" class="btn-primary w-full">登录 / 注册</RouterLink>
    </div>

    <LoadingSpinner v-else-if="loading" />
    <ErrorState v-else-if="error" @retry="loadAll" />

    <template v-else-if="profile">
      <!-- 用户信息卡片 -->
      <UserCard :profile="profile" :is-self="isSelf" @follow-change="onFollowChange" />

      <!-- 本人：功能按钮行 -->
      <div v-if="isSelf" class="mt-3 flex gap-3">
        <RouterLink to="/settings" class="btn-secondary flex-1">
          编辑资料
        </RouterLink>
        <RouterLink
          :to="{ name: 'question-box', params: { userId: profile.userId } }"
          class="btn-secondary flex-1"
        >
          管理提问箱
        </RouterLink>
      </div>

      <!-- 他人：提问箱入口（启用时显示） -->
      <RouterLink
        v-else-if="profile.questionBoxEnabled"
        :to="{ name: 'question-box', params: { userId: profile.userId } }"
        class="card-base mt-3 flex items-center gap-3 py-3 transition-opacity active:opacity-80"
      >
        <AppSvgIcon name="inbox" :size="18" class="text-ink-soft" />
        <span class="flex-1 text-sm">提问箱</span>
        <AppSvgIcon name="back" :size="16" class="rotate-180 text-ink-soft" />
      </RouterLink>

      <!-- 本人：功能菜单 -->
      <div v-if="isSelf" class="mt-3 space-y-3">
        <RouterLink
          to="/tickets"
          class="card-base flex items-center gap-3 py-3 transition-opacity active:opacity-80"
        >
          <AppSvgIcon name="file" :size="18" class="text-ink-soft" />
          <span class="flex-1 text-sm">我的工单</span>
          <AppSvgIcon name="back" :size="16" class="rotate-180 text-ink-soft" />
        </RouterLink>
        <RouterLink
          v-if="canAdmin"
          to="/admin"
          class="card-base flex items-center gap-3 py-3 transition-opacity active:opacity-80"
        >
          <AppSvgIcon name="shield" :size="18" class="text-ink-soft" />
          <span class="flex-1 text-sm">管理面板</span>
          <AppSvgIcon name="back" :size="16" class="rotate-180 text-ink-soft" />
        </RouterLink>
        <button
          type="button"
          class="btn-secondary w-full text-red-500"
          @click="handleSignOut"
        >
          退出登录
        </button>
      </div>

      <!-- Tab 切换（帖子 / 评论） -->
      <div class="mt-4 flex border-b border-line">
        <button
          type="button"
          class="flex-1 pb-2 text-sm font-medium transition-colors"
          :class="activeTab === 'posts' ? 'border-b-2 border-primary text-primary' : 'text-ink-soft'"
          @click="switchTab('posts')"
        >
          帖子 {{ posts.length > 0 ? posts.length : "" }}
        </button>
        <button
          type="button"
          class="flex-1 pb-2 text-sm font-medium transition-colors"
          :class="activeTab === 'comments' ? 'border-b-2 border-primary text-primary' : 'text-ink-soft'"
          @click="switchTab('comments')"
        >
          评论 {{ comments.length > 0 ? comments.length : "" }}
        </button>
      </div>

      <!-- 帖子列表 -->
      <div v-show="activeTab === 'posts'" class="mt-3 space-y-3 pb-6">
        <PostCard v-for="post in posts" :key="post.id" :post="post" />
        <EmptyState v-if="posts.length === 0 && !postsLoading" text="还没有发过帖子" icon="file" />
        <button
          v-if="postsHasMore"
          type="button"
          class="btn-secondary w-full"
          :disabled="postsLoading"
          @click="loadPosts(false)"
        >
          {{ postsLoading ? "加载中…" : "加载更多" }}
        </button>
      </div>

      <!-- 评论列表（简化展示，点击进评论详情） -->
      <div v-show="activeTab === 'comments'" class="mt-3 space-y-3 pb-6">
        <button
          v-for="comment in comments"
          :key="comment.id"
          type="button"
          class="card-base block w-full text-left transition-opacity active:opacity-80"
          @click="openComment(comment.id)"
        >
          <p class="text-sm leading-relaxed">{{ truncateText(comment.content, 120) }}</p>
          <div class="mt-2 flex items-center gap-4 text-xs text-ink-soft">
            <span class="flex items-center gap-1">
              <AppSvgIcon name="heart" :size="12" />
              {{ comment.likeCount ?? 0 }}
            </span>
            <span>{{ formatRelativeTime(comment.createdAt) }}</span>
          </div>
        </button>
        <EmptyState v-if="comments.length === 0 && !commentsLoading" text="还没有发过评论" icon="comment" />
        <button
          v-if="commentsHasMore"
          type="button"
          class="btn-secondary w-full"
          :disabled="commentsLoading"
          @click="loadComments(false)"
        >
          {{ commentsLoading ? "加载中…" : "加载更多" }}
        </button>
      </div>
    </template>
  </div>
</template>
