<!--
  关注 / 粉丝列表页

  路由：
    /user/:id/following  -> 关注列表
    /user/:id/followers  -> 粉丝列表

  数据源（公开接口，游客可访问）：
    GET /api/follow/following?userId=xxx&limit=20&offset=0
    GET /api/follow/followers?userId=xxx&limit=20&offset=0

  列表项：头像 + 用户名（名字颜色 / 牌子）+ 右侧关注按钮（复用 FollowButton，
  本人不显示；未登录点击自动跳登录页）。支持分页加载更多。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import FollowButton from "../components/user/FollowButton.vue";
import { listFollowing, listFollowers } from "../api/follow";
import { getUserProfile } from "../api/user";
import { useAuthStore } from "../stores/auth";
import type { FollowUserInfo } from "../types";

/** 分页大小 */
const PAGE_SIZE = 20;

const route = useRoute();
const auth = useAuthStore();

/** 目标用户 ID（路由参数） */
const userId = computed(() => route.params.id as string);

/** 列表类型：由路由名决定（user-following / user-followers） */
const type = computed<"following" | "followers">(() =>
  route.name === "user-following" ? "following" : "followers"
);

/** 顶部标题 */
const title = computed(() => (type.value === "following" ? "关注" : "粉丝"));

// ------------------------------------------------------------
//  数据状态
// ------------------------------------------------------------

const list = ref<FollowUserInfo[]>([]);
const loading = ref(true);
const error = ref(false);
const hasMore = ref(false);
const loadingMore = ref(false);

/** 目标用户昵称（副标题展示，加载失败不影响主流程） */
const targetUsername = ref("");

/** 按类型分派列表接口 */
function fetchPage(limit: number, offset: number): Promise<FollowUserInfo[]> {
  return type.value === "following"
    ? listFollowing(userId.value, limit, offset)
    : listFollowers(userId.value, limit, offset);
}

/** 加载第一页 */
async function load(): Promise<void> {
  if (!userId.value) return;
  loading.value = true;
  error.value = false;
  list.value = [];
  try {
    const page = await fetchPage(PAGE_SIZE, 0);
    list.value = page;
    hasMore.value = page.length === PAGE_SIZE;
    // 目标用户名（静默，失败不阻塞）
    try {
      const profile = await getUserProfile(userId.value);
      targetUsername.value = profile.username;
    } catch {
      targetUsername.value = "";
    }
  } catch {
    error.value = true; // client.ts 已自动 Toast
  } finally {
    loading.value = false;
  }
}

/** 加载更多（追加到列表尾部） */
async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchPage(PAGE_SIZE, list.value.length);
    list.value = list.value.concat(page);
    hasMore.value = page.length === PAGE_SIZE;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    loadingMore.value = false;
  }
}

// 切换用户 / 在关注与粉丝之间切换时重新加载
watch(
  () => route.fullPath,
  () => {
    if (route.name === "user-following" || route.name === "user-followers") {
      load();
    }
  }
);

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <!-- 顶部标题 -->
    <div class="mb-3 px-1">
      <h1 class="text-lg font-bold">{{ title }}</h1>
      <p v-if="targetUsername" class="mt-0.5 text-xs text-ink-soft">
        {{ targetUsername }} 的{{ title }}
      </p>
    </div>

    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" @retry="load" />

    <template v-else>
      <!-- 用户列表（整项可点击进入用户主页；FollowButton 自带 .stop 不会误触发跳转） -->
      <div v-if="list.length > 0" class="space-y-3">
        <RouterLink
          v-for="user in list"
          :key="user.id"
          :to="{ name: 'user-profile', params: { id: user.id } }"
          class="card-base flex items-center gap-3 py-3 transition-opacity active:opacity-80"
        >
          <!-- 头像（无头像时首字占位，按名字颜色着色） -->
          <img
            v-if="user.avatar"
            :src="user.avatar"
            :alt="user.username"
            class="h-10 w-10 shrink-0 rounded-full object-cover"
          />
          <span
            v-else
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            :style="
              user.nameColor
                ? {
                    color: user.nameColor,
                    background: 'color-mix(in srgb, ' + user.nameColor + ' 14%, transparent)',
                  }
                : {
                    color: 'var(--c-primary)',
                    background: 'color-mix(in srgb, var(--c-primary) 12%, transparent)',
                  }
            "
          >
            {{ user.username.slice(0, 1) }}
          </span>

          <!-- 用户名 + 牌子 -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                class="truncate text-sm font-medium"
                :style="{ color: user.nameColor ?? undefined }"
              >
                {{ user.username }}
              </span>
              <span
                v-if="user.badge"
                class="shrink-0 rounded bg-[color-mix(in_srgb,var(--c-primary)_12%,transparent)] px-1 text-[10px] text-primary"
              >
                {{ user.badge }}
              </span>
            </div>
          </div>

          <!-- 关注按钮（本人不显示；未登录点击自动跳登录页） -->
          <FollowButton
            v-if="user.id !== auth.userId"
            :user-id="user.id"
            :following="user.isFollowedByMe"
          />
        </RouterLink>

        <!-- 加载更多 -->
        <button
          v-if="hasMore"
          type="button"
          class="btn-secondary w-full"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
      </div>

      <!-- 空状态 -->
      <EmptyState
        v-else
        :text="type === 'following' ? '还没有关注任何人' : '还没有粉丝'"
        icon="user"
      />
    </template>
  </div>
</template>
