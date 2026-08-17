<!--
  表白详情页（/confession/:id）

  功能：
    - 完整内容（永远匿名，不显示作者）
    - 点赞 / 取消赞（/api/like targetType=confession）
    - 举报：跳转 /ticket/create?type=report&targetType=confession&targetId=xxx
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "../components/common/LoadingSpinner.vue";
import ErrorState from "../components/common/ErrorState.vue";
import AppSvgIcon from "../components/layout/AppSvgIcon.vue";
import { getConfessionDetail } from "../api/confession";
import { toggleLike } from "../api/like";
import { formatDateTime, formatNumber } from "../utils/format";
import { useAuthStore } from "../stores/auth";
import type { ConfessionInfo } from "../types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 表白 ID */
const confessionId = route.params.id as string;

const loading = ref(true);
const error = ref(false);
const confession = ref<ConfessionInfo | null>(null);

/** 点赞本地状态（详情不返回是否已赞，默认未赞） */
const liked = ref(false);
const likeCount = ref(0);
const likeBusy = ref(false);

/** 加载详情 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = false;
  try {
    const data = await getConfessionDetail(confessionId);
    confession.value = data;
    likeCount.value = data.likeCount ?? 0;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

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
    const result = await toggleLike("confession", confessionId);
    liked.value = result.liked;
    likeCount.value = result.likeCount;
  } catch {
    // client.ts 已自动 Toast
  } finally {
    likeBusy.value = false;
  }
}

/** 举报 → 工单创建页（report 类型，预填举报对象） */
function goReport(): void {
  if (!requireLogin()) return;
  router.push({
    path: "/ticket/create",
    query: { type: "report", targetType: "confession", targetId: confessionId },
  });
}

onMounted(load);
</script>

<template>
  <div class="px-3 pt-3">
    <LoadingSpinner v-if="loading" />
    <ErrorState v-else-if="error" message="表白不存在或无权访问" @retry="load" />

    <article v-else-if="confession" class="card-base">
      <!-- 类型标签 + 发布时间 -->
      <div class="mb-3 flex items-center gap-2 text-xs text-ink-soft">
        <span class="flex items-center gap-1 font-medium text-accent">
          <AppSvgIcon name="heart" :size="14" />
          表白墙 · 匿名
        </span>
        <span class="ml-auto">{{ formatDateTime(confession.createdAt) }}</span>
      </div>

      <!-- 完整内容（匿名，不显示作者） -->
      <p class="whitespace-pre-line break-all text-[15px] leading-relaxed">
        {{ confession.content }}
      </p>

      <!-- 操作行：点赞 + 举报 -->
      <div class="mt-4 flex items-center gap-4 border-t border-line pt-3 text-xs text-ink-soft">
        <button
          type="button"
          class="flex items-center gap-1 transition-colors"
          :class="liked ? 'text-accent' : ''"
          :disabled="likeBusy"
          @click="onToggleLike"
        >
          <AppSvgIcon name="heart" :size="16" />
          {{ formatNumber(likeCount) }}
        </button>
        <button
          type="button"
          class="ml-auto flex items-center gap-1 text-ink-soft transition-colors active:text-primary"
          @click="goReport"
        >
          <AppSvgIcon name="shield" :size="15" />
          举报
        </button>
      </div>
    </article>
  </div>
</template>
