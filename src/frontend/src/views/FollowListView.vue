<!--
  关注 / 粉丝列表页（Elk 顶部切换 AppTabs + 无边框紧凑用户行）

  路由：
    /user/:id/following  -> 关注列表
    /user/:id/followers  -> 粉丝列表
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import FeedSkeleton from "../components/common/FeedSkeleton.vue";
import EmptyState from "../components/common/EmptyState.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppTabs, { type TabOption } from "../components/common/AppTabs.vue";
import FollowButton from "../components/user/FollowButton.vue";
import UserAvatar from "../components/user/UserAvatar.vue";
import { listFollowing, listFollowers } from "../api/follow";
import { getUserProfile } from "../api/user";
import { useAuthStore } from "../stores/auth";
import type { FollowUserInfo } from "../types";

/** 分页大小 */
const PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 目标用户 ID（路由参数） */
const userId = computed(() => route.params.id as string);

/** 列表类型：由路由名决定（user-following / user-followers） */
const type = computed<"following" | "followers">(() =>
  route.name === "user-following" ? "following" : "followers"
);

const TABS: readonly TabOption[] = [
  { value: "following", label: "关注" },
  { value: "followers", label: "粉丝" },
];

function switchTab(next: string): void {
  const targetName = next === "followers" ? "user-followers" : "user-following";
  if (route.name === targetName) return;
  void router.replace({ name: targetName, params: { id: userId.value } });
}

// ------------------------------------------------------------
//  数据状态
// ------------------------------------------------------------

const list = ref<FollowUserInfo[]>([]);
const loading = shallowRef(true);
const error = shallowRef(false);
const hasMore = shallowRef(false);
const loadingMore = shallowRef(false);

/** 目标用户昵称（副标题展示，加载失败不影响主流程） */
const targetUsername = shallowRef("");

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
    try {
      const profile = await getUserProfile(userId.value);
      targetUsername.value = profile.username;
    } catch {
      targetUsername.value = "";
    }
  } catch {
    error.value = true;
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

watch(
  () => route.fullPath,
  () => {
    if (route.name === "user-following" || route.name === "user-followers") {
      void load();
    }
  }
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <!-- 目标用户说明 -->
    <div
      v-if="targetUsername"
      class="border-b border-subtle bg-canvas-soft px-4 py-2 text-xs text-ink-muted sm:px-5"
    >
      {{ targetUsername }} 的关系列表
    </div>

    <!-- 顶部下划线 Tab（关注 / 粉丝） -->
    <AppTabs
      :model-value="type"
      :items="TABS"
      variant="underline"
      stretch
      aria-label="关注与粉丝切换"
      @update:model-value="switchTab"
    />

    <FeedSkeleton v-if="loading" variant="elk" :count="5" />
    <div v-else-if="error" class="px-4 py-6">
      <ErrorState @retry="load" />
    </div>

    <template v-else>
      <!-- 用户列表（左链接右按钮，避免 button 嵌套在 a 内） -->
      <ul v-if="list.length > 0" role="list" class="pb-6">
        <li
          v-for="user in list"
          :key="user.id"
          class="flex items-center gap-3 border-b border-subtle px-4 py-3 transition-colors hover:bg-hover sm:px-5"
        >
          <RouterLink
            :to="{ name: 'user-profile', params: { id: user.id } }"
            class="flex min-w-0 flex-1 items-center gap-3 pressable"
          >
            <UserAvatar
              :src="user.avatar"
              :name="user.username"
              :name-color="user.nameColor"
              size="lg"
            />
            <span class="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                class="truncate text-sm font-medium text-ink"
                :style="user.nameColor ? { color: user.nameColor } : undefined"
              >
                {{ user.username }}
              </span>
              <span v-if="user.badge" class="tag-pill-accent shrink-0">
                {{ user.badge }}
              </span>
            </span>
          </RouterLink>

          <FollowButton
            v-if="user.id !== auth.userId"
            :user-id="user.id"
            :following="user.isFollowedByMe"
          />
        </li>

        <li v-if="hasMore" class="px-4 py-4 text-center">
          <button
            type="button"
            class="btn-secondary !py-1.5 text-xs"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "加载中…" : "加载更多" }}
          </button>
        </li>
      </ul>

      <div v-else class="px-4 py-6">
        <EmptyState
          :text="type === 'following' ? '还没有关注任何人' : '还没有粉丝'"
          icon="user"
        />
      </div>
    </template>
  </div>
</template>
